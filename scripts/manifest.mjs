export function validateManifest(manifest) {
  if (manifest?.manifest_version !== 2) throw new Error("Zotero bootstrap plug-ins require manifest_version 2");
  const app = manifest.applications?.zotero;
  for (const field of ["id", "update_url", "strict_min_version", "strict_max_version"]) {
    if (typeof app?.[field] !== "string" || !app[field].trim()) {
      throw new Error("Required Zotero manifest field missing: applications.zotero." + field);
    }
  }
  const updateURL = new URL(app.update_url);
  if (updateURL.protocol !== "https:" || updateURL.username || updateURL.password) {
    throw new Error("Zotero requires updates to be provided securely over HTTPS");
  }
  if (typeof manifest.version !== "string" || !/^\d+(\.\d+)*$/.test(manifest.version)) {
    throw new Error("Invalid release version");
  }
  return manifest;
}
