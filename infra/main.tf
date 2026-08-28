# Resolve the latest patch release in the series we want to track.
data "digitalocean_kubernetes_versions" "this" {
  version_prefix = var.k8s_version_prefix
}

# ---------------------------------------------------------------------------
# VPC (looked up, not created)
#
# Coming from AWS: this is the whole network. There are no subnets to create,
# no route tables, no internet gateway, no NAT gateway. A DigitalOcean VPC is
# one flat CIDR scoped to one region, and that's it.
#
# We look it up instead of creating it because DigitalOcean marked this VPC as
# the region's default, and default VPCs cannot be deleted. Managing it as a
# resource means `terraform destroy` fails every time.
# ---------------------------------------------------------------------------
data "digitalocean_vpc" "this" {
  name = var.vpc_name
}

# ---------------------------------------------------------------------------
# Container registry (DigitalOcean's answer to ECR)
#
# The registry is account-wide, not per-cluster. Images are addressed as
#   registry.digitalocean.com/<registry_name>/<image>:<tag>
# ---------------------------------------------------------------------------
resource "digitalocean_container_registry" "this" {
  name                   = var.registry_name
  subscription_tier_slug = var.registry_tier
  region                 = var.region
}

# ---------------------------------------------------------------------------
# Kubernetes cluster
# ---------------------------------------------------------------------------
resource "digitalocean_kubernetes_cluster" "this" {
  name    = "${var.cluster_name}-cluster"
  region  = var.region
  version = data.digitalocean_kubernetes_versions.this.latest_version

  # The entire "put the cluster in my network" step. Compare to EKS, where you
  # hand it a list of subnet IDs across AZs.
  vpc_uuid = data.digitalocean_vpc.this.id

  # The line that removes all the ECR pull-secret pain. DigitalOcean creates a
  # dockerconfigjson secret in kube-system, copies it into every namespace, and
  # patches each namespace's `default` ServiceAccount with imagePullSecrets.
  # Result: pods never need an imagePullSecrets field at all.
  registry_integration = true

  # Defaults to true on k8s 1.36+, which quietly adds $40/mo for a highly
  # available control plane. Not what you want on a learning cluster.
  # Note: once enabled on a cluster, HA cannot be turned back off.
  ha = false

  # Replace nodes before draining the old ones during an upgrade.
  surge_upgrade = true

  # Track patch releases automatically, inside the window below.
  auto_upgrade = true

  maintenance_policy {
    day        = "sunday"
    start_time = "04:00"
  }

  # Tears down load balancers and volumes that Kubernetes itself provisioned
  # (including the one ingress-nginx creates) when the cluster is destroyed.
  # Without this they survive `terraform destroy` and keep billing, because
  # Terraform never knew about them.
  destroy_all_associated_resources = true

  node_pool {
    name       = "${var.cluster_name}-pool"
    size       = var.node_size
    node_count = var.node_count
    tags       = ["learn-do", "worker"]
  }

  tags = ["learn-do", "terraform"]

  depends_on = [digitalocean_container_registry.this]
}

# ---------------------------------------------------------------------------
# Ingress controller
#
# Installing this chart causes Kubernetes to ask DigitalOcean for a Load
# Balancer (~$12/mo). That LB is the single public entry point; the Ingress
# objects in k8s/ then route by path behind it.
#
# On DOKS 1.33.1-do.0 and later the LB defaults to type REGIONAL_NETWORK (a
# network load balancer), which preserves the client source IP natively. Do NOT
# turn on PROXY protocol here - that is only for the older REGIONAL type.
# ---------------------------------------------------------------------------
resource "helm_release" "ingress_nginx" {
  name             = "ingress-nginx"
  repository       = "https://kubernetes.github.io/ingress-nginx"
  chart            = "ingress-nginx"
  version          = "4.11.3"
  namespace        = "ingress-nginx"
  create_namespace = true

  # The LB takes a few minutes to be provisioned and get its IP.
  timeout = 600
  wait    = true

  set {
    name  = "controller.service.annotations.service\\.beta\\.kubernetes\\.io/do-loadbalancer-name"
    value = "${var.cluster_name}-ingress-lb"
  }

  # One LB node is plenty for a learning cluster; this is the cost knob.
  set {
    name  = "controller.service.annotations.service\\.beta\\.kubernetes\\.io/do-loadbalancer-size-unit"
    value = "1"
  }

  set {
    name  = "controller.replicaCount"
    value = "2"
  }
}
