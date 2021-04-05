PATH  := node_modules/.bin:$(PATH)
SHELL := /bin/bash
PKG ?= pkg
DOCKER ?= docker
.PHONY: all clean docker.roborock build.roborock

all:
	npm run build

clean:
	rm -f valetudo

docker.roborock:
	$(DOCKER) build -t roborock:build -f Dockerfile.roborock .

build.roborock:
	$(DOCKER) run -v $(abspath .):/ws -it -t roborock:build bash -c "cd /ws && npm install --quiet && npm run-script build || cat /root/.npm/_logs/* && ls -la ~/.pkg-cache/*/*"
