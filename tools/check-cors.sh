#!/usr/bin/env bash
set -eu
# Read-only: show the actual bucket CORS configuration.
gcloud storage buckets describe gs://enlightenment-2.firebasestorage.app --format="default(cors_config)"
