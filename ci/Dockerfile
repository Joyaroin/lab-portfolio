# The container release.yml's browser jobs run in, so they install nothing: the runner's usual job image (node:22-bookworm)
# plus Chromium and its system packages, and Mesa's llvmpipe with the Xvfb display it draws through.
# Built and pushed by .forgejo/workflows/ci-image.yml, tagged with the Playwright version it holds. When package.json moves
# Playwright on, bump PLAYWRIGHT_VERSION there and the tag in release.yml. Until then a job downloads the newer browser
# itself (make browser runs `playwright install chromium` in this image): slower, never wrong.
FROM node:22-bookworm

ARG PLAYWRIGHT_VERSION
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    LAB_CI_IMAGE=1

RUN test -n "$PLAYWRIGHT_VERSION" \
 && apt-get update \
 && apt-get install -y --no-install-recommends libgl1-mesa-dri libegl-mesa0 libgbm1 xvfb xauth \
 && npx -y "playwright@$PLAYWRIGHT_VERSION" install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/* /root/.npm
