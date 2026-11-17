# CI runs these.
.PHONY: room meter resume og-image favicon photo setup frontend backend integration browser browser-light browser-release facts
room:
	blender -b -P tools/room/build.py -- --out src/assets/room.glb
	blender -b -P tools/room/resize.py -- src/assets/room.glb --size 2048
# Renders the meter bar's images with a local browser that has WebGL. Run on purpose, through heavy, on the Mac. CI doesn't run it.
meter:
	node tools/meter/render.mjs
setup:
	git config core.hooksPath .githooks
frontend:
	npm ci
	npm run typecheck
	npm test
	npm run build
# The paths, commands and tags the docs name exist. Needs only node.
facts:
	node scripts/check-facts.mjs
backend:
	@echo "Nothing to check: the site is static files served by nginx, with no server code."
integration: frontend
	node tests/integration.mjs
# Browsers and system packages are installed only in CI. The Mac has Playwright's browsers installed. The whole suite: release.yml runs it as browser-release and browser-light.
browser:
	npm ci
ifdef CI
	npx playwright install --with-deps chromium
endif
	npx playwright test $(PW_ARGS)
# The release specs: the @timing and @render tests. The two targets below take their pattern from here, so they can't drift apart.
RELEASE_SPECS := @timing|@render
# The browser recipe without the release specs. release.yml runs it on main after staging has moved. PR CI doesn't run it.
browser-light:
	$(MAKE) browser PW_ARGS='--grep-invert "$(RELEASE_SPECS)" $(PW_ARGS)'
# The browser recipe with only the release specs. release.yml runs it before staging moves.
browser-release:
	$(MAKE) browser PW_ARGS='--grep "$(RELEASE_SPECS)" $(PW_ARGS)'
# Builds public/resume.pdf from resume/resume.tex with tectonic. Run on the Mac; the first run downloads a TeX bundle, so it needs the network. CI does not run it.
resume:
	cd resume && tectonic resume.tex --outdir .
	cp -f resume/resume.pdf public/resume.pdf
	rm -f resume/resume.pdf
# Takes public/og-image.png, the link preview image, with a local browser that has WebGL. Run on purpose, through heavy, on the Mac. CI does not run it.
og-image:
	node tools/og-image.mjs
# Makes public/favicon.png and public/apple-touch-icon.png from the meter's committed images. Run on purpose, through heavy, on the Mac. Run it again after make meter. CI does not run it.
favicon:
	node tools/favicon.mjs
# Prepares a page image from a source image (any Pillow reads): `make photo SRC=<path>` makes src/assets/adham.jpg, the About me photo. With OUT, `make photo SRC=<path> OUT=<name.jpg> WIDTH=<px> CAP=<KB> [CROP=left,top,right,bottom]` makes src/assets/<name.jpg>. Needs Python 3 with Pillow. Run on purpose, on the Mac. CI does not run it.
photo:
	python3 tools/photo/make.py "$(SRC)" $(if $(PREVIEW),--preview "$(PREVIEW)") $(if $(OUT),--out "$(OUT)") $(if $(WIDTH),--width "$(WIDTH)") $(if $(CAP),--cap "$(CAP)") $(if $(CROP),--crop "$(CROP)")
