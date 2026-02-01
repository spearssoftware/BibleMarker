# Windows Code Signing (SmartScreen)

To **resolve** the "Windows protected your PC" / SmartScreen warning (not just document the workaround), you need to sign the Windows build with a code signing certificate.

## Options

| Option | Cost | SmartScreen result |
|--------|------|--------------------|
| **EV (Extended Validation)** | ~$400+/year, hardware token | Immediate reputation; no warning. |
| **OV (Organization Validated)** | Cheaper, often available to individuals | Warning may appear until certificate builds reputation; you can [submit the file to Microsoft](https://www.microsoft.com/en-us/wdsi/filesubmission/) for review. |
| **Azure Trusted Signing** | Pay-as-you-go (Microsoft cloud signing) | No hardware token; good for CI. See [Azure Code Signing](https://tauri.app/distribute/sign/windows/#azure-code-signing) and [tutorial](https://melatonin.dev/blog/code-signing-on-windows-with-azure-trusted-signing/). |

Use a **code signing** certificate from a trusted CA—**SSL/TLS certificates do not work** for signing executables.

---

## Option A: OV certificate (PFX) + GitHub Actions

Applies to OV certificates (e.g. from DigiCert, Sectigo) where you have a `.pfx` file. For certs issued after June 1, 2023 or for EV, check your CA’s docs.

### 1. Get certificate and PFX

- Buy an OV code signing certificate from a [Microsoft-trusted CA](https://learn.microsoft.com/en-us/windows-hardware/drivers/dashboard/code-signing-cert-manage).
- You need a `.pfx` file (certificate + private key). If you have `.cer` + `.key`, create a PFX:
  ```bash
  openssl pkcs12 -export -in cert.cer -inkey private-key.key -out certificate.pfx
  ```
  Set an export password and keep it; you’ll use it in GitHub Secrets.

### 2. Get thumbprint and timestamp URL

On **Windows** (e.g. in PowerShell):

1. Import the PFX (one-time, to read details):
   ```powershell
   $password = Read-Host -AsSecureString
   Import-PfxCertificate -FilePath certificate.pfx -CertStoreLocation Cert:\CurrentUser\My -Password $password
   ```
2. Run **certmgr.msc** → Personal → Certificates → double‑click your cert → **Details** tab.
3. Note:
   - **Thumbprint** → use as `certificateThumbprint` (remove spaces).
   - **Signature hash algorithm** → usually `sha256` → use as `digestAlgorithm`.
4. **Timestamp URL**: your CA provides one (e.g. DigiCert: `http://timestamp.digicert.com`, Sectigo: `http://timestamp.sectigo.com`).

### 3. Configure Tauri

In `src-tauri/tauri.conf.json`, add or extend `bundle.windows`:

```json
{
  "bundle": {
    "windows": {
      "certificateThumbprint": "YOUR_THUMBPRINT_NO_SPACES",
      "digestAlgorithm": "sha256",
      "timestampUrl": "http://timestamp.digicert.com"
    }
  }
}
```

Replace with your thumbprint and CA’s timestamp URL.

### 4. GitHub Secrets

In the repo: **Settings → Secrets and variables → Actions**, add:

| Secret name | Value |
|-------------|--------|
| `WINDOWS_CERTIFICATE` | Base64‑encoded PFX. On Windows: `certutil -encode certificate.pfx base64cert.txt` then paste the contents of `base64cert.txt` (without the header/footer lines). |
| `WINDOWS_CERTIFICATE_PASSWORD` | The PFX export password. |

### 5. Import certificate in the workflow (Windows job only)

In `.github/workflows/release.yml`, add a step **before** “Install frontend dependencies” (or before the step that runs `pnpm install`), only for the Windows runner:

```yaml
      - name: Import Windows certificate
        if: matrix.platform == 'windows-latest'
        env:
          WINDOWS_CERTIFICATE: ${{ secrets.WINDOWS_CERTIFICATE }}
          WINDOWS_CERTIFICATE_PASSWORD: ${{ secrets.WINDOWS_CERTIFICATE_PASSWORD }}
        run: |
          New-Item -ItemType directory -Path certificate -Force
          Set-Content -Path certificate/tempCert.txt -Value $env:WINDOWS_CERTIFICATE
          certutil -decode certificate/tempCert.txt certificate/certificate.pfx
          Remove-Item -Path certificate/tempCert.txt
          Import-PfxCertificate -FilePath certificate/certificate.pfx -CertStoreLocation Cert:\CurrentUser\My -Password (ConvertTo-SecureString -String $env:WINDOWS_CERTIFICATE_PASSWORD -Force -AsPlainText)
```

**Important:** Only add this step after you’ve created the two secrets; otherwise the Windows job will fail when it tries to import the PFX.

### 6. Build

Push to the `release` branch (or trigger the workflow). The Windows build will use the cert from the runner’s store and Tauri will sign the executable and installer. After that, SmartScreen may still show a warning until the certificate gains reputation; you can submit the signed file to [Microsoft](https://www.microsoft.com/en-us/wdsi/filesubmission/) for review.

---

## Option B: Azure Trusted Signing (cloud, no PFX in CI)

You sign with a certificate stored in Azure; no PFX or thumbprint in the repo. Good for CI.

1. Create an [Azure Trusted Signing](https://learn.microsoft.com/en-us/azure/trusted-signing/) account and certificate profile.
2. Install [trusted-signing-cli](https://github.com/Levminer/trusted-signing-cli): `cargo install trusted-signing-cli`.
3. In `src-tauri/tauri.conf.json`, set a custom sign command under `bundle.windows`:
   ```json
   {
     "bundle": {
       "windows": {
         "signCommand": "trusted-signing-cli -e https://wus2.codesigning.azure.net -a YOUR_ACCOUNT -c YOUR_PROFILE -d BibleMarker %1"
       }
     }
   }
   ```
4. In GitHub Actions, set secrets: `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID` (from an App Registration with access to the signing account).
5. Run the Windows build on a runner that has the Azure CLI / auth and the env vars set so `trusted-signing-cli` can sign.

Full steps: [Tauri – Azure Code Signing](https://tauri.app/distribute/sign/windows/#azure-code-signing) and the [Azure Trusted Signing tutorial](https://melatonin.dev/blog/code-signing-on-windows-with-azure-trusted-signing/).

---

## References

- [Tauri: Windows Code Signing](https://tauri.app/distribute/sign/windows/)
- [Microsoft: Code signing certificate management](https://learn.microsoft.com/en-us/windows-hardware/drivers/dashboard/code-signing-cert-manage)
- [Submit a file for SmartScreen analysis](https://www.microsoft.com/en-us/wdsi/filesubmission/)
