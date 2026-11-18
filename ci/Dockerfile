# The container release.yml's browser jobs run in, so they install nothing: the runner's usual job image (node:22-bookworm)
# plus Chromium and its system packages, and Mesa's llvmpipe with the Xvfb display it draws through.
# release.yml's ci-image job builds it when the registry doesn't have it yet. Its tag is ci- and the first 12 hex digits of
# this file's SHA-256, so any change here needs the new tag in release.yml: scripts/ci-image.test.mjs checks both that and
# that PLAYWRIGHT_VERSION matches @playwright/test in package-lock.json.
FROM node:22-bookworm

ARG PLAYWRIGHT_VERSION=1.64.1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    LAB_CI_IMAGE=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends libgl1-mesa-dri libegl-mesa0 libgbm1 xvfb xauth \
 && npx -y "playwright@$PLAYWRIGHT_VERSION" install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/* /root/.npm
