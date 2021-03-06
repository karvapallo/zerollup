# Typescript transform paths plugin

tsconfig baseUrl + paths alias rewriting in bundles and declaration files. You can use absolute paths in libraries. All them will be rewritted to relative in transpiled js and in d.ts files.

Works everywhere, no more [tspath](https://github.com/duffman/tspath), [rollup-plugin-alias](https://github.com/rollup/rollup-plugin-alias) and other workarounds.

Why? Problem described [here](https://github.com/Microsoft/TypeScript/issues/23701): d.ts files not working, if absolute paths used in npm-packaged library.

## Setup

For setup transform plugin use [ttypescript](https://github.com/cevek/ttypescript). This is a wrapper around typescript with transformer plugin support in tsconfig.json.

my-lib/tsconfig.json:

```json
{
    "compilerOptions": {
        "baseUrl": ".",
        "paths": {
            "my-lib/*": ["src/*"]
        },
        "plugins": [
            { "transform": "@zerollup/ts-transform-paths" }
        ]
    }
}
```

my-lib/src/index.ts
```ts
export * from 'my-lib/some'
```

my-lib/src/some.ts
```ts
export const some = '123'
```

Transpiled my-lib/dist/index.js

```ts
export * from './some'
```

Typings my-lib/dist/index.d.ts

```ts
export * from './some';
```

For more examples see [zerollup demo lib](https://github.com/zerkalica/zerollup-demo/tree/master/packages/lib1).

## Limitations

Only first element in paths substitutions array used.

my-lib/tsconfig.json:
```json
{
    "compilerOptions": {
        "paths": {
            "my-lib/*": ["src/*", "not_used_substitution/*"]
        }
    }
}
```
