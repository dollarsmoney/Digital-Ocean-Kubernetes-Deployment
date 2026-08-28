variable "cluster_name" {
  description = "Name prefix for the cluster and related resources."
  type        = string
  default     = "learn-do"
}

variable "region" {
  description = "DigitalOcean region slug. A VPC lives in exactly one region."
  type        = string
  default     = "nyc3"
}

variable "vpc_name" {
  description = <<-EOT
    Name of an EXISTING VPC to place the cluster in. This is looked up as a data
    source rather than created, because DigitalOcean promoted the first VPC in
    this region to be the region default, and default VPCs cannot be deleted.
    Managing it as a resource makes `terraform destroy` fail forever.
  EOT
  type        = string
  default     = "learn-do-vpc"
}

variable "node_size" {
  description = "Droplet size slug for worker nodes."
  type        = string
  default     = "s-2vcpu-2gb"
}

variable "node_count" {
  description = "Number of worker nodes in the pool."
  type        = number
  default     = 2
}

variable "k8s_version_prefix" {
  description = <<-EOT
    Version series to track, e.g. "1.34.". The digitalocean_kubernetes_versions
    data source resolves this to the latest matching patch release, so you never
    hardcode a slug that goes stale.
  EOT
  type        = string
  default     = "1.34."
}

variable "registry_name" {
  description = <<-EOT
    Container registry name. Must be globally unique across all of DigitalOcean,
    since it becomes part of registry.digitalocean.com/<name>.
  EOT
  type        = string
  default     = "learn-do-registry"
}

variable "registry_tier" {
  description = <<-EOT
    starter (free, 1 repository, 500 MiB), basic ($5/mo, 5 repositories, 5 GiB),
    or professional ($20/mo). We need two repositories (frontend + backend),
    so starter is not sufficient.
  EOT
  type        = string
  default     = "basic"
}
