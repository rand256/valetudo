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

.in_docker:
	bash -c "npm run-script build || cat /root/.npm/_logs/* && ls -la ~/.pkg-cache/*/*"

build.roborock:
	$(DOCKER) run -v $(abspath .):/ws -it -t roborock:build bash -c "cd /ws && npm install --quiet && npm run-script build || cat /root/.npm/_logs/* && ls -la ~/.pkg-cache/*/*"
# bash -c "make -C /ws .in_docker"
