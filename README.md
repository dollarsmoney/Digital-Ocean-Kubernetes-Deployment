# DigitalOcean Kubernetes deployment

A complete, small, readable path from `git push` to a running app on DigitalOcean Kubernetes:
Terraform for infrastructure, GitHub Actions for CI/CD, a container registry, an ingress-backed
load balancer, and a backend that reads its configuration from a ConfigMap and a Secret.

Built as a learning project by someone coming from AWS, so the notes below focus on **where
DigitalOcean differs from AWS**, not on Kubernetes basics.

---

## If you're coming from AWS

| AWS | DigitalOcean |
| --- | --- |
| VPC with a CIDR | `digitalocean_vpc` with an `ip_range` — same idea |
| Public + private subnets, per AZ | **None.** There is no `digitalocean_vpc_subnet` resource |
| Internet Gateway, NAT Gateway, route tables | **None to manage.** Nodes get a public IP and egress directly |
| Subnet IDs passed to the cluster | One `vpc_uuid` argument |
| ECR | **DOCR** — `registry.digitalocean.com/<registry>/<image>` |
| ECR pull: 12-hour token, hand-built `imagePullSecret` | `registry_integration = true` — DO creates and syncs it for you |
| AWS Load Balancer Controller | ingress-nginx, which provisions a DO Load Balancer |
| IAM role for CI (OIDC) | A DO API token in a GitHub secret |
| Secrets Manager / SSM | No managed equivalent — plain Kubernetes Secrets |
| Control plane ~$73/mo | Control plane **free**; HA control plane +$40/mo |

### The two biggest surprises

**1. A DigitalOcean VPC has no subnets.** No public/private split, no NAT gateway, no route
tables. The whole subnet-design step from EKS simply doesn't exist. A VPC is one flat CIDR in one
region.

**2. Worker nodes have public IPs, and that's normal.** There is no "private node pool" option.
DOKS instead puts a managed firewall in front of them that only permits inbound from RFC1918
ranges, so the nodes are *publicly addressed* but not *publicly reachable*. Same security outcome
as a private subnet, no NAT gateway bill, less control. The one real limitation: if you need
"no workload node has a public IP" for compliance, DOKS can't do that.

Three non-overlapping CIDRs are still in play:

| Network | Range |
| --- | --- |
| VPC / nodes | `10.10.0.0/16` |
| Pods (`cluster_subnet`) | `10.244.0.0/16` (DO default) |
| Services (`service_subnet`) | `10.245.0.0/16` (DO default) |

---

## Layout

```
infra/                    Terraform: VPC lookup, DOKS cluster, DOCR, ingress-nginx
apps/backend/             Node/Express API + Jest unit tests
apps/frontend/            Static page served by nginx
k8s/                      Namespace, ConfigMap, Secret template, Deployments, Service, Ingress
.github/workflows/        CI/CD pipeline
```

---

## Cost

| Item | Cost |
| --- | --- |
| DOKS control plane | free |
| 2 × `s-2vcpu-2gb` nodes | ~$36/mo |
| DOCR Basic (5 repos) | $5/mo |
| DO Load Balancer (ingress) | ~$12/mo |
| **Total** | **~$53/mo** |

Billed per second, so an afternoon costs cents. `terraform destroy` removes all of it.

---

## Setup

### 1. Infrastructure

```powershell
cd infra
$env:DIGITALOCEAN_TOKEN = "<your DO API token>"

terraform init

# The first apply MUST be two-stage. The helm and kubernetes providers are
# configured from the cluster's own outputs, which don't exist yet, and
# Terraform can't plan a provider whose config is unknown.
terraform apply -target=digitalocean_kubernetes_cluster.this
terraform apply
```

Later applies are single-stage.

> **The VPC is looked up, not created.** DigitalOcean promoted the first VPC in `nyc3` to be the
> region's default, and **default VPCs cannot be deleted** — managing it as a Terraform resource
> makes `terraform destroy` fail every single time. `data "digitalocean_vpc"` sidesteps that.
> VPCs are free, so leaving it costs nothing. Any VPC you create *after* the default exists will
> be deletable normally.

### 2. GitHub secrets

Repo → Settings → Secrets and variables → Actions:

| Secret | Value |
| --- | --- |
| `DIGITALOCEAN_ACCESS_TOKEN` | A DO API token with read/write |
| `BACKEND_API_KEY` | Anything, e.g. `sk_live_democonfigvalue` |
| `BACKEND_DB_PASSWORD` | Anything, e.g. `demo-password-123` |

### 3. Push

```powershell
git push -u origin main
```

The pipeline builds, scans, pushes, deploys, and prints the URL in the job summary.

### 4. Look at it

```powershell
doctl kubernetes cluster kubeconfig save learn-do-cluster
kubectl -n ingress-nginx get svc ingress-nginx-controller   # the LB IP
kubectl -n demo get pods,svc,ingress
```

Browse `http://app.<LB-IP>.nip.io`. nip.io resolves `*.1.2.3.4.nip.io` to `1.2.3.4`, so host-based
routing works with no DNS setup.

---

## How config reaches the pods

This is the part worth understanding. Two objects, injected the same way:

| Object | Holds | In git? |
| --- | --- | --- |
| ConfigMap `backend-config` | `APP_NAME`, `GREETING`, `LOG_LEVEL` | **Yes** — `k8s/backend-configmap.yaml` |
| Secret `backend-secret` | `API_KEY`, `DB_PASSWORD` | **No** — created by CI from GitHub secrets |

In `k8s/backend.yaml`:

```yaml
envFrom:                       # bulk import: every key becomes an env var
  - configMapRef: {name: backend-config}
  - secretRef:    {name: backend-secret}
env:
  - name: DB_PASSWORD_EXPLICIT # the other idiom: one specific key
    valueFrom:
      secretKeyRef: {name: backend-secret, key: DB_PASSWORD}
```

`envFrom` is what makes this automatic for **every** pod — all replicas now, and any pod the
Deployment creates later. The app can't tell which value came from which object; both arrive as
ordinary environment variables.

Verify it end to end:

```powershell
kubectl -n demo exec deploy/backend -- printenv APP_NAME API_KEY
curl http://app.<LB-IP>.nip.io/api/info      # run twice - the pod name changes
```

### The ConfigMap trap

**Editing a ConfigMap does not restart pods.** You apply the change, `kubectl` says the Deployment
is unchanged, and your pods keep serving the old values with nothing anywhere indicating they're
stale. The fix is the `checksum/config` pod annotation, which CI sets from a hash of the ConfigMap.
Changing an annotation on the pod template *is* a template change, so it triggers a rollout.

### Honest note on Secrets

Kubernetes Secrets are **base64-encoded, not encrypted**. Anyone with `get secrets` in the
namespace reads them in plaintext. Keeping values out of git is a genuine win and it's what this
repo achieves; it is not the same as encryption. Real hardening is RBAC plus encryption at rest,
or an external secrets operator backed by a vault.

---

## Pipeline

Push to `main` runs six jobs. The four gates run in parallel; `build` waits for all of them,
`deploy` waits for `build`.

| Job | What it does | Blocks the build? |
| --- | --- | --- |
| `quality` | ESLint, Jest unit tests with coverage thresholds, `npm audit` | Yes |
| `sast` | CodeQL `security-extended` on the JavaScript | Findings go to the Security tab |
| `supply-chain` | Trivy dependency scan + CycloneDX SBOM artifact | Yes, on CRITICAL/HIGH |
| `iac-scan` | Trivy misconfiguration scan of Terraform and k8s YAML | Reports only |
| `build` | Build → **Trivy image scan** → push, tagged with the commit SHA | Yes, on CRITICAL/HIGH |
| `deploy` | Apply manifests, pin images to the SHA, wait for rollout, smoke test | — |

Pull requests run every gate but never push an image or touch the cluster.

### Supply-chain measures, and why each one is there

- **Actions pinned by commit SHA, not tag.** Tags are mutable. Whoever controls an action can
  repoint `v4` at new code, which then runs with your secrets on the next build — this is exactly
  how the `tj-actions/changed-files` compromise worked. A SHA is immutable.
- **Base images pinned by digest.** Same argument, one layer down: `node:22-alpine` can be
  repointed at different bytes tomorrow.
- **`npm ci`, never `npm install`.** Installs exactly the lockfile and fails if the lockfile and
  `package.json` disagree, so a transitive dependency can't be silently upgraded at build time.
- **Scan before push.** The image is built with `load: true`, scanned, and only then pushed. Scan
  after push and a vulnerable image is already available to pull.
- **`ignore-unfixed: true`.** Fails only on CVEs that actually have a patch available. Without it
  the pipeline blocks on things you cannot act on, and people learn to bypass it.
- **`permissions: contents: read`** at the top, widened only where needed.
- **`persist-credentials: false`** on checkout, so no usable token is left in `.git/config`.
- **Deploy by SHA tag, never `latest`.** Makes the running version identifiable and rollback a
  matter of pointing at an older SHA.

Refresh a pinned SHA deliberately:

```powershell
gh api repos/actions/checkout/git/ref/tags/v4 --jq .object.sha
docker pull node:22-alpine
docker inspect --format='{{index .RepoDigests 0}}' node:22-alpine
```

---

## DigitalOcean load balancer notes

- On DOKS **1.33.1-do.0 and later** the LB defaults to type `REGIONAL_NETWORK` (a network load
  balancer), which preserves the client source IP natively. **Don't enable PROXY protocol** — that
  belongs to the older `REGIONAL` type and needs
  `service.beta.kubernetes.io/do-loadbalancer-type: "REGIONAL"`.
- **Hairpin limitation:** a pod cannot reach its own load balancer's external IP. This setup dodges
  it because the browser calls `/api`, not a pod. If you later add server-side pod→LB calls, the fix
  is the `service.beta.kubernetes.io/do-loadbalancer-hostname` annotation.
- One ingress controller = **one** LB. Adding more Ingress objects reuses it. Per-app
  `type: LoadBalancer` Services would each provision a separate ~$12/mo LB.

---

## Teardown

```powershell
cd infra
terraform destroy
```

`destroy_all_associated_resources = true` on the cluster means the LB that ingress-nginx created is
torn down with it. Without that flag it would survive, because Terraform never knew about it.

Then confirm in the DO console that no Droplets, Load Balancers, or Volumes remain — and **revoke
the API token** if it has ever been pasted anywhere it shouldn't be.

The VPC stays (it's the undeletable region default) and the registry stays unless you remove it.
Both are fine to leave: the VPC is free, the registry is $5/mo and saves you re-pushing images.
