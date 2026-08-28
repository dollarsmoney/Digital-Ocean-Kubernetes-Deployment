output "vpc_id" {
  description = "UUID of the VPC the cluster runs in."
  value       = data.digitalocean_vpc.this.id
}

output "vpc_ip_range" {
  description = "CIDR of the VPC. Worker node private IPs come from this range."
  value       = data.digitalocean_vpc.this.ip_range
}

output "cluster_name" {
  description = "Cluster name, for `doctl kubernetes cluster kubeconfig save <name>`."
  value       = digitalocean_kubernetes_cluster.this.name
}

output "cluster_id" {
  description = "UUID of the DOKS cluster."
  value       = digitalocean_kubernetes_cluster.this.id
}

output "cluster_version" {
  description = "Kubernetes version that the version prefix resolved to."
  value       = digitalocean_kubernetes_cluster.this.version
}

output "registry_endpoint" {
  description = "Image prefix, e.g. registry.digitalocean.com/learn-do-registry"
  value       = digitalocean_container_registry.this.endpoint
}

output "registry_server" {
  description = "Registry host, for `docker login`."
  value       = digitalocean_container_registry.this.server_url
}

# The credential embedded here is short-lived (DigitalOcean issues it with a
# ~7 day expiry by default). Prefer `doctl kubernetes cluster kubeconfig save`
# for day-to-day use; this output is here so you can see what DOKS hands back.
output "kubeconfig" {
  description = "Full kubeconfig. Write it out with: terraform output -raw kubeconfig"
  value       = digitalocean_kubernetes_cluster.this.kube_config[0].raw_config
  sensitive   = true
}
