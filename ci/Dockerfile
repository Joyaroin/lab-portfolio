# The container release.yml's browser jobs run in, so they install nothing: node 22 on Debian bookworm, pinned by digest,
# plus Chromium and its system packages, and Mesa's llvmpipe with the Xvfb display it draws through.
# release.yml's ci-image job (adham/ci's build-ci-image) builds it when the registry doesn't have it yet. Its tag is ci- and a hash
# of the files in ci/, so any change here builds a new image on the next release, with no edit to release.yml.
# scripts/ci-image.test.mjs checks that PLAYWRIGHT_VERSION matches @playwright/test in package-lock.json, and that the base is pinned.
FROM node:22.23.5-bookworm@sha256:e13726ca604184d7a91fcacab1fc09eefd642dc28e79ac34e85540dd93b78cfb

ARG PLAYWRIGHT_VERSION=1.65.1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    LAB_CI_IMAGE=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends libgl1-mesa-dri libegl-mesa0 libgbm1 xvfb xauth \
 && npx -y "playwright@$PLAYWRIGHT_VERSION" install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/* /root/.npm
