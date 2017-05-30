all: keymetrics.js keymetrics.min.js

keymetrics.js:
	@./node_modules/.bin/browserify \
		lib/keymetrics.js \
		--standalone Keymetrics \
		--outfile dist/keymetrics.js

keymetrics.min.js:
	@./node_modules/.bin/browserify \
		lib/keymetrics.js \
		--standalone Keymetrics | \
		./node_modules/.bin/uglifyjs > ./dist/keymetrics.min.js

doc:
	@./node_modules/.bin/jsdoc \
		-r ./lib/ \
		--readme ./README.md \
		-d doc \
		-t ./node_modules/minami/

clean:
	rm dist/*

push:
	mv ./dist/keymetrics.js ../km-front/app/lib

.PHONY: clean
