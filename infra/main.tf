# PathCare Infrastructure Configuration
# Target Region: AWS ap-south-1 (Mumbai) per CONTEXT §4.2

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  type        = string
  description = "AWS Primary Region for PathCare deployment"
  default     = "ap-south-1"
}

variable "environment" {
  type        = string
  description = "Environment name (staging, production)"
  default     = "staging"
}
