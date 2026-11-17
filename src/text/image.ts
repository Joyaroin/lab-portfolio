/**
 * Is a page's image in the panel's markup? Every panel mounts at boot, and an image must not be fetched then (nothing is fetched at
 * boot, and the first-screen budget is unaffected), so it is mounted only once its page has been shown. It then stays while the panel
 * fades out, and goes when the panel turns to a page that has none.
 *  `mounted` is whether it is mounted now, `pageHasImage` whether the panel's page names one, `shown` whether the visit is at this panel.
 */
export function imageMounted(mounted: boolean, pageHasImage: boolean, shown: boolean): boolean {
  return pageHasImage && (mounted || shown);
}

/**
 * Does a page draw its lead and stat line in the column beside its image (and, in the portrait framing, put the image after the bullets)?
 * A project page does: a page whose image is at `top` and that has a stat line. The About me portrait's page has none, so it is drawn as it
 * was (the portrait beside the heading and the station's line, the lead below, and the portrait above them in portrait).
 */
export function imageBesideText(page: { image?: { place: "top" | "below" }; stat?: string }): boolean {
  return page.image?.place === "top" && page.stat !== undefined;
}
