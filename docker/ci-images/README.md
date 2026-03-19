# BibleMarker CI Images

Base Docker images for GitHub Actions CI via ARC (Actions Runner Controller).

## Images

| Image | Purpose |
|-------|---------|
| `biblemarker-ci-node` | Node 22, pnpm 10, gh CLI, semgrep. For lint, test, and helper jobs. |
| `biblemarker-ci-full` | Above + Rust stable, clippy, rustfmt, cargo-audit, Tauri system deps. For Rust checks and Linux release builds. |

## Prerequisites

- Gitea instance with container registry enabled
- ARC (Actions Runner Controller) v0.13+ with container mode

## Setup

1. Copy this directory to a Gitea repo (e.g. `infra/biblemarker-ci-images`)
2. Configure Gitea repository variables:
   - `GITEA_REGISTRY`: Your Gitea registry URL (e.g. `gitea.example.com/infra`)
3. Configure Gitea repository secrets:
   - `GITEA_USER`: Registry push username
   - `GITEA_TOKEN`: Registry push token
4. Run the workflow manually to build initial images
5. On GitHub (BibleMarker repo), configure:
   - Repository variable: `GITEA_REGISTRY` (same URL)
   - Repository secrets: `GITEA_REGISTRY_USER`, `GITEA_REGISTRY_TOKEN`

## ARC Runner Setup

Add `imagePullSecrets` to your ARC RunnerScaleSet Helm values:

```yaml
template:
  spec:
    imagePullSecrets:
      - name: gitea-registry-creds
```

Create the k8s Secret:

```bash
kubectl create secret docker-registry gitea-registry-creds \
  --docker-server=gitea.example.com \
  --docker-username=<user> \
  --docker-password=<token> \
  -n <arc-runner-namespace>
```
