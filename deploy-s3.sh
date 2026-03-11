#!/usr/bin/env bash
# Deploy pdfs/ to an S3 static website.
#
# Usage:
#   ./deploy-s3.sh <bucket-name> [aws-region] [--profile <name>]
#
# Examples:
#   ./deploy-s3.sh my-jimny-manual
#   ./deploy-s3.sh my-jimny-manual eu-west-1
#   ./deploy-s3.sh my-jimny-manual eu-west-1 --profile myprofile
#   ./deploy-s3.sh my-jimny-manual --profile myprofile
#
# Prerequisites:
#   - AWS CLI installed and configured (aws configure, or AWS_PROFILE / AWS_ACCESS_KEY_ID set)
#   - pdfs/index.html exists (run: npm run generate)

set -euo pipefail

# ── Args ──────────────────────────────────────────────────────────────────────
BUCKET=""
REGION=""
PROFILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile|-p)
      PROFILE="$2"; shift 2 ;;
    --profile=*)
      PROFILE="${1#*=}"; shift ;;
    -*)
      echo "Unknown option: $1"; exit 1 ;;
    *)
      if   [[ -z "$BUCKET" ]]; then BUCKET="$1"
      elif [[ -z "$REGION" ]]; then REGION="$1"
      else echo "Unexpected argument: $1"; exit 1
      fi
      shift ;;
  esac
done

if [[ -z "$BUCKET" ]]; then
  echo "Usage: $0 <bucket-name> [aws-region] [--profile <name>]"
  echo "  e.g. $0 my-jimny-manual eu-west-1 --profile myprofile"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PDFS_DIR="$SCRIPT_DIR/pdfs"

# ── Preflight checks ──────────────────────────────────────────────────────────
echo "── Preflight checks"

if ! command -v aws &>/dev/null; then
  echo "✗ AWS CLI not found. Install it: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
  exit 1
fi
echo "  ✓ aws CLI found: $(aws --version 2>&1 | head -1)"

PROFILE_ARGS=()
[[ -n "$PROFILE" ]] && PROFILE_ARGS=(--profile "$PROFILE")

if ! aws sts get-caller-identity "${PROFILE_ARGS[@]}" &>/dev/null; then
  echo "✗ AWS credentials not configured${PROFILE:+ for profile \"$PROFILE\"}. Run: aws configure"
  exit 1
fi
ACCOUNT=$(aws sts get-caller-identity "${PROFILE_ARGS[@]}" --query Account --output text)
echo "  ✓ AWS account: $ACCOUNT"

if [[ ! -f "$PDFS_DIR/index.html" ]]; then
  echo "✗ pdfs/index.html not found. Run: npm run generate"
  exit 1
fi
PDF_COUNT=$(find "$PDFS_DIR" -name "*.pdf" | wc -l | tr -d ' ')
echo "  ✓ pdfs/ ready ($PDF_COUNT PDFs)"

# ── Resolve region ────────────────────────────────────────────────────────────
if [[ -z "$REGION" ]]; then
  REGION=$(aws configure get region "${PROFILE_ARGS[@]}" 2>/dev/null || true)
fi
if [[ -z "$REGION" ]]; then
  REGION="us-east-1"
  echo "  ℹ No region specified, defaulting to us-east-1"
fi
echo "  ✓ Region: $REGION"

REGION_ARGS=(--region "$REGION")
if [[ -n "$PROFILE" ]]; then
  REGION_ARGS+=(--profile "$PROFILE")
  echo "  ✓ Profile: $PROFILE"
fi

# ── Create bucket ─────────────────────────────────────────────────────────────
echo ""
echo "── S3 bucket: $BUCKET"

if aws s3api head-bucket --bucket "$BUCKET" "${REGION_ARGS[@]}" 2>/dev/null; then
  echo "  ✓ Bucket already exists"
else
  echo "  Creating bucket..."
  if [[ "$REGION" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "$BUCKET" "${REGION_ARGS[@]}"
  else
    aws s3api create-bucket --bucket "$BUCKET" "${REGION_ARGS[@]}" \
      --create-bucket-configuration LocationConstraint="$REGION"
  fi
  echo "  ✓ Bucket created"
fi

# ── Disable public access block (required before setting a public policy) ─────
echo "  Disabling public access block..."
aws s3api delete-public-access-block --bucket "$BUCKET" "${REGION_ARGS[@]}"
echo "  ✓ Public access block removed"

# ── Bucket policy: public read ────────────────────────────────────────────────
echo "  Setting public-read bucket policy..."
aws s3api put-bucket-policy --bucket "$BUCKET" "${REGION_ARGS[@]}" --policy "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [{
    \"Effect\": \"Allow\",
    \"Principal\": \"*\",
    \"Action\": \"s3:GetObject\",
    \"Resource\": \"arn:aws:s3:::${BUCKET}/*\"
  }]
}"
echo "  ✓ Bucket policy applied"

# ── Enable static website hosting ────────────────────────────────────────────
echo "  Enabling static website hosting..."
aws s3 website "s3://$BUCKET" "${REGION_ARGS[@]}" \
  --index-document index.html \
  --error-document index.html
echo "  ✓ Static website hosting enabled"

# ── Sync files ────────────────────────────────────────────────────────────────
echo ""
echo "── Uploading files to s3://$BUCKET/"

# Upload index.html with no-cache so updates are visible immediately
echo "  Uploading index.html (no-cache)..."
aws s3 cp "$PDFS_DIR/index.html" "s3://$BUCKET/index.html" \
  "${REGION_ARGS[@]}" \
  --content-type "text/html" \
  --cache-control "no-cache, must-revalidate"

# Sync everything else (PDFs + any sub-index.html files)
echo "  Syncing remaining files (PDFs cached for 1 day)..."
aws s3 sync "$PDFS_DIR/" "s3://$BUCKET/" \
  "${REGION_ARGS[@]}" \
  --exclude "*.DS_Store" \
  --exclude "index.html" \
  --cache-control "max-age=86400" \
  --no-progress
echo "  ✓ Upload complete"

# ── Output URL ────────────────────────────────────────────────────────────────
echo ""
echo "── Done!"
if [[ "$REGION" == "us-east-1" ]]; then
  echo "  🌐 ${BUCKET}.s3-website-${REGION}.amazonaws.com"
else
  echo "  🌐 http://${BUCKET}.s3-website.${REGION}.amazonaws.com"
fi
echo ""
