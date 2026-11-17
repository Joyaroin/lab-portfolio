/**
 * Is a page's image in the panel's markup? Every panel mounts at boot, and an image must not be fetched then (nothing is fetched at
 * boot, and the first-screen budget is unaffected), so it is mounted only once its page has been shown. It then stays while the panel
 * fades out, and goes when the panel turns to a page that has none.
 *  `mounted` is whether it is mounted now, `pageHasImage` whether the panel's page names one, `shown` whether the visit is at this panel.
 */
export function imageMounted(mounted: boolean, pageHasImage: boolean, shown: boolean): boolean {
  return pageHasImage && (mounted || shown);
}
