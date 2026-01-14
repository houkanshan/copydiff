### Install Dependencies with pnpm

Source: https://github.com/shikijs/shiki/blob/main/CONTRIBUTING.md

Installs project dependencies using the pnpm package manager. Ensure pnpm is installed globally before running this command.

```shell
pnpm install
```

--------------------------------

### Basic Console Log Example

Source: https://github.com/shikijs/shiki/blob/main/docs/packages/vitepress.md

A simple JavaScript example demonstrating a basic console log statement. This snippet is often used for initial testing or to verify environment setup.

```javascript
console.log('hello')
```

--------------------------------

### Install @shikijs/transformers with Package Managers

Source: https://github.com/shikijs/shiki/blob/main/docs/packages/transformers.md

Demonstrates how to install the @shikijs/transformers package using various popular JavaScript package managers, including npm, yarn, pnpm, bun, and deno.

```sh
npm i -D @shikijs/transformers
```

```sh
yarn add -D @shikijs/transformers
```

```sh
pnpm add -D @shikijs/transformers
```

```sh
bun add -D @shikijs/transformers
```

```sh
deno add npm:@shikijs/transformers
```

--------------------------------

### Shiki Highlighted Line Example

Source: https://github.com/shikijs/shiki/blob/main/docs/guide/decorations.md

An example of how to apply a decoration to an entire line of code using Shiki's decoration syntax. It demonstrates highlighting the first line with a specific class.

```typescript
// @decorations:[{"start":{"line":0,"character":0},"end":{"line":0,"character":-1},"properties":{"class":"highlighted-word"}}]]
const x = 10
console.log(x)
```

--------------------------------

### JavaScript Example Log

Source: https://github.com/shikijs/shiki/blob/main/packages/shiki/test/out/multiple-themes-no-default.html

A simple JavaScript console log statement.

```javascript
console.log("hello")
```

--------------------------------

### Install @shikijs/twoslash

Source: https://github.com/shikijs/shiki/blob/main/docs/packages/twoslash.md

Installs the @shikijs/twoslash package as a development dependency using different package managers like npm, yarn, pnpm, bun, and deno.

```sh
npm install -D @shikijs/twoslash
```

```sh
yarn add -D @shikijs/twoslash
```

```sh
pnpm add -D @shikijs/twoslash
```

```sh
bun add -D @shikijs/twoslash
```

```sh
deno add npm:@shikijs/twoslash
```

--------------------------------

### Run Tests with Vitest

Source: https://github.com/shikijs/shiki/blob/main/CONTRIBUTING.md

Executes the test suite for the shiki project using Vitest. This command is used to verify code changes and ensure the project's stability.

```shell
pnpm test
```

--------------------------------

### Install @shikijs/cli for Node.js API

Source: https://github.com/shikijs/shiki/blob/main/docs/packages/cli.md

Details the installation of the @shikijs/cli package for use within a Node.js project, covering various package managers (npm, yarn, pnpm, bun, deno).

```sh
npm i @shikijs/cli
```

```sh
yarn add @shikijs/cli
```

```sh
pnpm add @shikijs/cli
```

```sh
bun add @shikijs/cli
```

```sh
deno add npm:@shikijs/cli
```

--------------------------------

### Install @shikijs/colorized-brackets with npm, yarn, pnpm, bun, or deno

Source: https://github.com/shikijs/shiki/blob/main/docs/packages/colorized-brackets.md

Installs the @shikijs/colorized-brackets package as a development dependency using various package managers.

```sh
npm i -D @shikijs/colorized-brackets
```

```sh
yarn add -D @shikijs/colorized-brackets
```

```sh
pnpm add -D @shikijs/colorized-brackets
```

```sh
bun add -D @shikijs/colorized-brackets
```

```sh
deno add npm:@shikijs/colorized-brackets
```

--------------------------------

### Example of v1 Match Algorithm for Comments

Source: https://github.com/shikijs/shiki/blob/main/docs/packages/transformers.md

Provides a code example demonstrating the behavior of the 'v1' match algorithm for single-line comments in Shiki transformers. It highlights how comments are counted, affecting subsequent line highlighting.

```ts
// [!code highlight:3]
console.log('highlighted') // [!code hl]
console.log('highlighted') // [!code hl]
console.log('not highlighted')
```

--------------------------------

### Line Highlighting Syntax Example (Markdown)

Source: https://github.com/shikijs/shiki/blob/main/docs/packages/rehype.md

This example demonstrates the markdown syntax for enabling line highlighting in Shiki.js. Lines or ranges of lines can be specified within curly braces after the language identifier.

```markdown
```js {1,3-4}
console.log('1') // highlighted
console.log('2')
console.log('3') // highlighted
console.log('4') // highlighted
```
```

--------------------------------

### Install @shikijs/cli Globally

Source: https://github.com/shikijs/shiki/blob/main/docs/packages/cli.md

Demonstrates how to install the Shiki CLI globally using various package managers (npm, yarn, pnpm, bun, deno). This allows the command aliases 'shiki' and 'skat' to be used.

```sh
npm i -g @shikijs/cli
```

```sh
yarn global add @shikijs/cli
```

```sh
pnpm add -g @shikijs/cli
```

```sh
bun add -g @shikijs/cli
```

```sh
deno install -gREn skat npm:@shikijs/cli
```

--------------------------------

### Example of v3 Match Algorithm for Comments

Source: https://github.com/shikijs/shiki/blob/main/docs/packages/transformers.md

Presents a code example illustrating the 'v3' match algorithm for single-line comments in Shiki transformers. This new algorithm adjusts the line counting compared to 'v1', potentially leading to different highlighting results.

```ts
// [!code highlight:2]
console.log('highlighted') // [!code hl]
console.log('highlighted') // [!code hl]
console.log('not highlighted')
```

--------------------------------

### Build All Packages with pnpm

Source: https://github.com/shikijs/shiki/blob/main/CONTRIBUTING.md

Compiles and builds all packages within the shiki project. This command is essential after making code changes or setting up the development environment.

```shell
pnpm build
```

--------------------------------

### HTML Output Example for Diff Notation

Source: https://github.com/shikijs/shiki/blob/main/docs/packages/transformers.md

Example of the HTML output generated by Shiki for diff notation, demonstrating the `has-diff` class on the `<pre>` tag and `diff remove`/`diff add` classes on `<span>` elements.

```html
<pre class="shiki has-diff"> <!-- Notice `has-diff` -->
  <code>
    <span class="line"></span>
    <span class="line"><span>function</span><span>()</span><span>{</span></span>
    <span class="line diff remove">  <!-- Notice `diff` and `remove` -->
      <span></span><span>console</span><span>.</span><span>log</span><span>(</span><span>&#39;</span><span>hewwo</span><span>&#39;</span><span>) </span>
    </span>
    <span class="line diff add">  <!-- Notice `diff` and `add` -->
      <span></span><span>console</span><span>.</span><span>log</span><span>(</span><span>&#39;</span><span>hello</span><span>&#39;</span><span>) </span>
    </span>
    <span class="line"><span></span><span>}</span></span>
    <span class="line"><span></span></span>
  </code>
</pre>
```

--------------------------------

### Install @shikijs/monaco Package

Source: https://github.com/shikijs/shiki/blob/main/docs/packages/monaco.md

Install the @shikijs/monaco package using various package managers like npm, yarn, pnpm, bun, or deno. This package enables Shiki's syntax highlighting engine for Monaco Editor.

```sh
npm i -D @shikijs/monaco
```

```sh
yarn add -D @shikijs/monaco
```

```sh
pnpm add -D @shikijs/monaco
```

```sh
bun add -D @shikijs/monaco
```

```sh
deno add npm:@shikijs/monaco
```

--------------------------------

### Create Highlighter Instance for Server and Client Components

Source: https://github.com/shikijs/shiki/blob/main/docs/packages/next.md

This example demonstrates creating a Shiki highlighter instance globally. This instance can be referenced directly from both server and client components, allowing for efficient code highlighting without repeated initialization.

```ts
import { createHighlighter } from 'shiki'

const highlighter = createHighlighter({
  themes: ['nord'],
  langs: ['javascript'],
})

// Inside an async server component, or client side `useEffect`
const html = (await highlighter).codeToHtml('const a = 1', {
  lang: 'javascript',
  theme: 'nord'
})
```

--------------------------------

### Install modern-monaco Package

Source: https://github.com/shikijs/shiki/blob/main/docs/packages/monaco.md

Install the modern-monaco package using npm, yarn, pnpm, bun, or deno. Alternatively, import it directly from esm.sh CDN for browser usage without a build step.

```sh
npm i -D modern-monaco
```

```sh
yarn add -D modern-monaco
```

```sh
pnpm add -D modern-monaco
```

```sh
bun add -D modern-monaco
```

```sh
deno add npm:modern-monaco
```

--------------------------------

### Usage of modern-monaco

Source: https://github.com/shikijs/shiki/blob/main/docs/packages/monaco.md

Utilize modern-monaco for building Monaco Editor instances. This example demonstrates setting up an HTML element for the editor, initializing a workspace with files, and lazily loading the editor.

```html
<!-- index.html -->
<monaco-editor theme="vitesse-dark"></monaco-editor>
<script src="app.js" type="module"></script>

```

```js
// app.js
import { lazy, Workspace } from 'modern-monaco'

// create a workspace with initial files
const workspace = new Workspace({
  initialFiles: {
    'index.html': `<html><body>...</body></html>`,
    'main.js': `console.log('Hello, world!')`,
  },
  entryFile: 'index.html',
})

// initialize the editor lazily
await lazy({ workspace })

// write a file and open it in the editor
workspace.fs.writeFile('util.js', 'export function add(a, b) { return a + b; }')
workspace.openTextDocument('util.js')

```

--------------------------------

### Example Twoslash Markdown Usage

Source: https://github.com/shikijs/shiki/blob/main/docs/packages/vitepress.md

An example of how to use the `twoslash` tag with a TypeScript code block in Markdown. This enables the type-hovering feature provided by Shiki Twoslash.

```markdown
```ts twoslash
console.log('hello')
//      ^?
```
```

--------------------------------

### Install @shikijs/vitepress-twoslash

Source: https://github.com/shikijs/shiki/blob/main/docs/packages/vitepress.md

Installs the Shiki Twoslash VitePress plugin using various package managers. This package is essential for enabling Shiki's enhanced features within VitePress.

```sh
npm i -D @shikijs/vitepress-twoslash
```

```sh
yarn add -D @shikijs/vitepress-twoslash
```

```sh
pnpm add -D @shikijs/vitepress-twoslash
```

```sh
bun add -D @shikijs/vitepress-twoslash
```

```sh
deno add npm:@shikijs/vitepress-twoslash
```

--------------------------------

### Create Shikijs Highlighter with JavaScript Engine

Source: https://github.com/shikijs/shiki/blob/main/docs/packages/twoslash.md

Initializes the Shikijs highlighter using the core module and the JavaScript regex engine. This setup is suitable for JavaScript code highlighting.

```typescript
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

const highlighter = await createHighlighterCore({
  engine: createJavaScriptRegexEngine()
})
```

--------------------------------

### TypeScript Readonly Type Example

Source: https://github.com/shikijs/shiki/blob/main/packages/twoslash/test/out/rich/rich-error-hover.html

This TypeScript example demonstrates the use of the `Readonly` utility type to create an object with all its properties marked as read-only. This ensures that the object's properties cannot be modified after creation, enhancing immutability. The example shows the definition of a `Todo` interface and its application with `Readonly`.

```typescript
interface Todo {
  title: string;
}

type Readonly<T> = {
  readonly [P in keyof T]: T[P];
};

const todo: Readonly<Todo> = {
  title: "Delete inactive users".toUpperCase(),
};

// The following line would cause a TypeScript error:
// todo.title = "Hello";
```

--------------------------------

### TypeScript Variable Declaration Example

Source: https://github.com/shikijs/shiki/blob/main/packages/twoslash/test/out/includes/replaced_directives.html

An example of declaring a constant variable named 'hello' in TypeScript with a specific type annotation for a string property. It then accesses this property.

```typescript
export const const hello: {
    str: string;
}hello = { str: stringstr: "world" };

const hello: {
    str: string;
}hello.str
```

--------------------------------

### Update Vitest Snapshots

Source: https://github.com/shikijs/shiki/blob/main/CONTRIBUTING.md

Updates snapshot tests in the shiki project. Use this command when you have intentionally changed the output of components and need to refresh the expected snapshots.

```shell
pnpm test -u
```

--------------------------------

### Using rendererRich with transformerTwoslash

Source: https://github.com/shikijs/shiki/blob/main/docs/packages/twoslash.md

Demonstrates how to use the `rendererRich` function with the `transformerTwoslash` from Shiki. This setup enhances code highlighting by providing scoped class names and enabling hover information syntax highlighting.

```ts
import { rendererRich, transformerTwoslash } from '@shikijs/twoslash'

transformerTwoslash({
  renderer: rendererRich() // <--
})
```

--------------------------------

### Highlight Code with Shiki Shorthand (TypeScript)

Source: https://github.com/shikijs/shiki/blob/main/docs/guide/shorthands.md

Demonstrates using the `codeToHtml` shorthand function from Shiki to highlight a JavaScript code snippet. It takes the code string and configuration options (language and theme) as input and returns an HTML string. This example highlights a simple variable assignment.

```typescript
import { codeToHtml } from 'shiki'

const code = 'const a = 1' // input code
const html = await codeToHtml(code, {
  lang: 'javascript',
  theme: 'vitesse-dark'
})

console.log(html) // highlighted html string

```

--------------------------------

### Synchronous Highlighter with Oniguruma Engine (Pre-loaded)

Source: https://github.com/shikijs/shiki/blob/main/docs/guide/sync-usage.md

Demonstrates creating a Shiki highlighter synchronously when the Oniguruma engine has been loaded asynchronously beforehand. This allows for synchronous highlighting operations after the initial engine setup.

```typescript
import js from '@shikijs/langs/javascript'
import nord from '@shikijs/themes/nord'
import { createHighlighterCoreSync } from 'shiki/core'
import { createOnigurumaEngine } from 'shiki/engine/oniguruma'

// Load this somewhere beforehand
const engine = await createOnigurumaEngine(import('shiki/wasm'))

const shiki = createHighlighterCoreSync({
  themes: [nord],
  langs: [js],
  engine, // if a resolved engine passed in, the rest can still be synced.
})

const html = shiki.highlight('console.log(1)', { lang: 'js', theme: 'nord' })
```

--------------------------------

### Cloudflare Workers Integration with Shiki Core

Source: https://github.com/shikijs/shiki/blob/main/docs/guide/install.md

Shows how to integrate Shiki with Cloudflare Workers, which require specific handling due to WebAssembly limitations. This example uses `createHighlighterCore` and `loadWasm` to load WASM and language/theme data, suitable for serverless environments.

```typescript
// @ts-ignore
// be sure to specify the exact version
import js from '@shikijs/langs/javascript'
import nord from '@shikijs/themes/nord'
import { createHighlighterCore, loadWasm } from 'shiki/core'

// import wasm as assets
await loadWasm(import('shiki/onig.wasm'))

export default {
  async fetch() {
    const highlighter = await createHighlighterCore({
      themes: [nord],
      langs: [js],
    })

    return new Response(highlighter.codeToHtml('console.log(\'shiki\');', {
      theme: 'nord',
      lang: 'js'
    }))
  },
}
```

--------------------------------

### Importing and Using Generated Shiki Bundle

Source: https://github.com/shikijs/shiki/blob/main/docs/packages/codegen.md

Example of how to import and use the `codeToHtml` function from a generated Shiki bundle file within a TypeScript project. It demonstrates calling `codeToHtml` with code, language, and theme options.

```typescript
import { codeToHtml } from './shiki.bundle'

const html = await codeToHtml(code, { lang: 'typescript', theme: 'light-plus' })
```

--------------------------------

### Run Automated Migration

Source: https://github.com/shikijs/shiki/blob/main/docs/blog/v2.md

Execute an automated codemod script to migrate Shiki from v1 to v2. This command uses npx to run the latest version of the covolute tool specifically for Shiki migration.

```bash
npx covolute@latest shiki/v1-to-v2
```

--------------------------------

### Load Custom Theme on Highlighter Creation - TypeScript

Source: https://github.com/shikijs/shiki/blob/main/docs/guide/load-theme.md

Demonstrates how to define and load a custom theme when creating a shiki highlighter instance. This involves providing a `Theme` object to the `themes` array during initialization. The example shows basic theme settings for comments.

```ts
import { createHighlighter } from 'shiki'

const myTheme = {
  name: 'my-theme',
  settings: [
    {
      scope: ['comment'],
      settings: {
        foreground: '#888'
      }
    },
    // ...
  ]
}

const highlighter = await createHighlighter({
  themes: [myTheme],
  langs: [],
})

const code = `console.log('hello')`
const html = highlighter.codeToHtml(code, {
  lang: 'javascript',
  theme: 'my-theme'
})
```

--------------------------------

### Basic Console Log

Source: https://github.com/shikijs/shiki/blob/main/docs/guide/decorations.md

A simple JavaScript code snippet that logs a variable to the console. This is a fundamental example of code execution.

```javascript
console.log(x)
```

--------------------------------

### Enable Deprecation Warnings and Throw Errors (TypeScript)

Source: https://github.com/shikijs/shiki/blob/main/docs/blog/v2.md

Configures Shiki to enable deprecation warnings and set them to throw as errors. This is useful for identifying and addressing deprecated API usage during migration.

```typescript
import { enableDeprecationWarnings } from 'shiki/core'

enableDeprecationWarnings(true, true) // enable warnings and throw errors

// use crateHighlighter(...) etc. after that
```

--------------------------------

### Async Highlighting with Markdown-it-Async

Source: https://github.com/shikijs/shiki/blob/main/docs/packages/markdown-it.md

Demonstrates how to integrate Shiki with markdown-it-async for asynchronous code highlighting. This setup allows for on-demand loading of themes and languages, making the highlighting process asynchronous. It requires importing `fromAsyncCodeToHtml` from '@shikijs/markdown-it/async' and using `md.renderAsync`.

```typescript
import { fromAsyncCodeToHtml } from '@shikijs/markdown-it/async'
import MarkdownItAsync from 'markdown-it-async'
import { codeToHtml } from 'shiki' // Or your custom shorthand bundle

// Initialize MarkdownIt instance with markdown-it-async
const md = MarkdownItAsync()

md.use(
  fromAsyncCodeToHtml(
    // Pass the codeToHtml function
    codeToHtml,
    {
      themes: {
        light: 'vitesse-light',
        dark: 'vitesse-dark',
      }
    }
  )
)

// Use `md.renderAsync` instead of `md.render`
const html = await md.renderAsync('# Title\n```ts\nconsole.log("Hello, World!")\n```')
```

--------------------------------

### Force Shiki Version 2 Resolution (package.json)

Source: https://github.com/shikijs/shiki/blob/main/docs/blog/v2.md

Specifies version resolutions in `package.json` to force the usage of Shiki v2.0.0 and its related packages. This helps identify dependencies that might still rely on deprecated Shiki APIs.

```json
{
  "resolutions": {
    "shiki": "^2",
    "@shikijs/core": "^2",
    "@shikijs/transformers": "^2",
    "@shikijs/markdown-it": "^2",
    "@shikijs/rehype": "^2"
  }
}
```

--------------------------------

### Client Component for Shiki Highlighting in Next.js

Source: https://github.com/shikijs/shiki/blob/main/docs/packages/next.md

This example creates a client component (`CodeBlock`) that uses Shiki for code highlighting. It fetches the highlighted code using a `useLayoutEffect` hook and can optionally receive pre-rendered HTML via the `initial` prop from a server component.

```tsx
'use client'
import { JSX, useLayoutEffect, useState } from 'react'
import { highlight } from './shared'

export function CodeBlock({ initial }: { initial?: JSX.Element }) {
  const [nodes, setNodes] = useState(initial)

  useLayoutEffect(() => {
    void highlight('console.log("Rendered on client")', 'ts').then(setNodes)
  }, [])

  return nodes ?? <p>Loading...</p>
}
```

--------------------------------

### Render Indent Guides with transformerRenderIndentGuides

Source: https://github.com/shikijs/shiki/blob/main/docs/packages/transformers.md

The `transformerRenderIndentGuides` transformer renders indentation as individual `<span>` elements with the class 'indent'. This enables CSS to style and visualize indentation levels, improving code readability. It works by adding specific classes and potentially CSS variables to the spans. No external dependencies are needed.

```css
pre.shiki .indent {
  display: inline-block;
  position: relative;
  left: var(--indent-offset);
}

pre.shiki .indent:empty {
  height: 1lh;
  vertical-align: bottom;
}

pre.shiki .indent::before {
  content: '';
  position: absolute;
  opacity: 0.15;
  width: 1px;
  height: 100%;
  background-color: currentColor;
}
```

--------------------------------

### Disable Deprecation Warnings (TypeScript)

Source: https://github.com/shikijs/shiki/blob/main/docs/blog/v2.md

Configures Shiki to disable deprecation warnings entirely. This can be used when warnings are not desired or have been addressed.

```typescript
import { enableDeprecationWarnings } from 'shiki/core'

enableDeprecationWarnings(false)
```

--------------------------------

### TypeScript Readonly Interface Example

Source: https://github.com/shikijs/shiki/blob/main/packages/twoslash/test/out/rich/rich-none-theme.html

Demonstrates the use of the TypeScript `Readonly` utility type to create an immutable version of the `Todo` interface. It shows how properties become read-only after applying the type.

```typescript
interface Todo {
  /** The title of the todo item */
  title: string;
}

const todo: Readonly<Todo> = {
  title: "Delete inactive users".toUpperCase(),
};

// Cannot assign to 'title' because it is a read-only property.
todo.title = "Hello";
```

--------------------------------

### TypeScript Constant Declarations and Type Annotations

Source: https://github.com/shikijs/shiki/blob/main/packages/twoslash/test/out/includes/nested_includes-c.html

Demonstrates how to declare constants with specific types in TypeScript. These examples show basic type annotations and arithmetic operations between typed constants. Note: The `5a`, `10b`, and `numberc` types are illustrative and would require definition in a real TypeScript project.

```typescript
export const const a: 5a = 5

```

```typescript
export const const b: 10b = 10

```

```typescript
export const const c: numberc = const a: 5a + const b: 10b
```

--------------------------------

### TypeScript Variable Declarations

Source: https://github.com/shikijs/shiki/blob/main/packages/twoslash/test/out/markdown-it/highlight-disable-triggers.html

Examples of TypeScript variable declarations. The first set shows declaration with type annotations for numbers, and the second set shows simple variable assignments.

```typescript
const const a: 123a = 123
    const const b: 123b = 123
    const const v: 123v = 123
```

```typescript
const a = 123
    const b = 123
    const v = 123
    //    ^?
```

--------------------------------

### TypeScript Object Property Access/Assignment Example

Source: https://github.com/shikijs/shiki/blob/main/packages/twoslash/test/out/rich/no-icons.html

This TypeScript snippet appears to be an incomplete or erroneous attempt at accessing or assigning properties to an object. It highlights potential syntax issues in TypeScript.

```typescript
const obj: {
    boo: number;
    bar: () => number;
    baz: string;
} obj.bbarbazbooboo: numberoo
```

--------------------------------

### Render Code to JSX Runtime in React Server Component (Next.js)

Source: https://github.com/shikijs/shiki/blob/main/docs/packages/next.md

This example shows how to convert code to a HAST (HTML Abstract Syntax Tree) and then render it using `hast-util-to-jsx-runtime` in a React Server Component. This approach allows for custom rendering of `pre` and `code` elements, offering more flexibility.

```tsx
import type { JSX } from 'react'
import type { BundledLanguage } from 'shiki'
import { toJsxRuntime } from 'hast-util-to-jsx-runtime'
import { Fragment } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { codeToHast } from 'shiki'

export default function Page() {
  return (
    <main>
      <CodeBlock lang="ts">
        {[
          'console.log("Hello")',
          'console.log("World")',
        ].join('\n')}
      </CodeBlock>
    </main>
  )
}

interface Props {
  children: string
  lang: BundledLanguage
}

async function CodeBlock(props: Props) {
  const out = await codeToHast(props.children, {
    lang: props.lang,
    theme: 'github-dark'
  })

  return toJsxRuntime(out, {
    Fragment,
    jsx,
    jsxs,
    components: {
      // your custom `pre` element
      pre: props => <pre data-custom-codeblock {...props} />
    },
  }) as JSX.Element
}
```

--------------------------------

### Create Shiki Highlighter Core

Source: https://github.com/shikijs/shiki/blob/main/docs/packages/rehype.md

Demonstrates how to create a core Shiki highlighter instance, which is the foundational element for syntax highlighting. This often involves setting up the engine.

```typescript
import { createHighlighterCore } from 'shiki/core'
import { createOnigurumaEngine } from 'shiki/engine/oniguruma'

async function createHighlighter() {
  const highlighter = await createHighlighterCore({
    themes: [
      // themes can be imported from 'shiki/themes'
      // e.g. import { dracula } from 'shiki/themes'
    ],
    langs: [
      // languages can be imported from 'shiki/langs'
      // e.g. import { python } from 'shiki/langs'
    ],
    engine: createOnigurumaEngine()
  })
  return highlighter
}
```

--------------------------------

### Integrate Shikijs with Markdown-It

Source: https://github.com/shikijs/shiki/blob/main/docs/packages/markdown-it.md

This snippet shows how to import and use the Shikijs plugin with the Markdown-It library. It configures Shikijs to use 'vitesse-light' for light themes and 'vitesse-dark' for dark themes. Ensure both markdown-it and @shikijs/markdown-it are installed.

```typescript
import Shiki from '@shikijs/markdown-it'
import MarkdownIt from 'markdown-it'

const md = MarkdownIt()

md.use(await Shiki({
  themes: {
    light: 'vitesse-light',
    dark: 'vitesse-dark',
  }
}))
```

--------------------------------

### Set up Twoslash Theme in VitePress

Source: https://github.com/shikijs/shiki/blob/main/docs/packages/vitepress.md

Enhances the VitePress application by installing the Vue plugin for Twoslash and importing the necessary CSS styles. This step enables the visual features and style for Twoslash-enhanced code blocks.

```typescript
// @twoslash-cache: {"v":1,"hash":"2a5df659524ba4854bc92abbfbd15feefdb74ba936c5a020d6bdc7d308b959b2","data":"N4Igdg9gJgpgziAXAbVAFwJ4AcZJACwgDcYAnEAGhDRgA808AKAQwBsBLZuASgAJ2wNUgDNmAYxi8AomHzMwEgIJYsAYQiC6aADph2AWywRSaabPlKV6zfUog4aZiaQBGACxVWMMAHM0+VwB2KkdSHxgGRBAZOQUYZTUNGltPAVxEAAYqMTlScSFXNwBfCnRsdIJiMjtkyJAWDi4+MQ0HXgAVAHcIOFYufAAxVghmNAEfADUAVxhEXmBdXiX+MAc2VjmWFTmEil4ILDHWgH45oZGx32mYa2F2Hz4AXgA+XiIIdigAbl0i3QMjCYOt1ev1zqNxtc7FAIGIEFFrrwsKwpj4BLw0BAVmtWKxeODLpMZrxOux/LwHBgvHAAHS6XQASUMxlM/nYcF4wimCiOYBWvAABjSiGSYFhSPA4AB6fwwfQwKUCWC0GloOAC3jyKC8KZwSQC5gqGm6mCMLo9PpwQbDCFXGbcDUCOCfSSywXeWKWLAawgQADWNLsa2ciAArAAOTzePwBRAuACcISc4Tq5tBVoJkJmdg4YHSLmyuXy1UQgRKZRweEIJHIIS0TDYnB4vBaq1M7Xwctm80WywAMswMBApmg5gARGB3PPqZl5wQ/PnLD0WeLbXiMMRoWhzGIrhLWWpPV7vT4Lv56ZlAjtdoOhSLuAsgLy+fxIUNJsIRPDX+U5tJIAAmQsnGLchS3LahyirKpa2oesokYcUDjITA+C0bwoDgOYFkXJYByHEdx0nNIZyMOc0AXZZeGXOIEk2TdtzMT1V0SGw0CPN4Pm+X5bycSIANDICn2jV9Sw/FM8HQsBML/PMkGCEAchAzcSwAiDMErKJq2qOtbAQxsmhbVp207eVsN7PDB2HUdeAnKcbggWdvAoizqPMWi1w3Lcd3cr0Dy0DiT24sBzwBFkOlM3AqGDfiADZH2fGM33Er8oh/KKn3/MTFKLFSwJcFx1KgrSYJqeD6nlfxoDQ3yWMYYBNRUXgih85j9ySAK5iC3iQwAwIsmEl9YxcAbQgkqIaK9WT0kjHLlIKRA1NKSDNMqGsyr0+osBAyqyD4Q0sB2FQAB55AwZ4ev48MAGYoyGpBbuoZNUpAA7pqQWalLyPLXFDIrVu02DagbRpmwEIRRAkJi9ysDr6H+S9TF3DzWOB6K70A+MBsS0SXAUsaXuRvy4YYVI5MQT7coWgClorCpAY2upEJ2iI9saw7eASU6wHOy6Hpcd9BqSxBHoJuo3rJ9JEzm76FuKZaNPp0rdKZyrCCgPgubO55jT1Y7kAOXk4FOTUeYAXWeRCUTRMA5gABWtgR9cN9gTjmM6zb2A3Dld1YTY9549hpYOXdaOYADkIAZMBhDIZ2fbd02MAt7gjqwbnzvXABqFx9hrG0Nb5kWEzu4XReeuoTXexBpa+0CPv+pX1pVkGm2aYzgQtMEbUJa5zNw7FHFxTYDrTvZQ79s4e6zByY/uQKuLPBHAXbEFLWtC4Z+hWF4RARFkVRdFMUH9Z8Wnu1JFJclKWpOkwEZRGMXwdlOW5Tdff5IURRocVJRlSLFTSToKqdUpttQmkFAdXWpo0zr0zBfB02IXRP31JNFiPoID+kDOjPiD0AKPRxsNaWYtvxr27pvC+1da5UxLC4NSntFLQAqGFIEit5jQxRv5egzVOSkEcrwAA5N/MUEo4BwAEcvcKsDyG2iJJIYQfD9CCIAAJWnYH6dgAAraUwjf5iIALRoDIVaKUYgODOQEbwKUUpeDIAAIQtFgLwfArAzaSKvJFXh/ChGij0dKWU8oJH3wvCvFRaiNHaKlLo0RcBDHGPwFKG+MAaRwnEVYmx9jHGSBcW44JdBQmwFEFMVgpgcJLCkphOY6UKC9jQQkeq7NmqtRhqjAKPYB5QJNGaeJ8C5F8GsbYhxTDnGuN7CUHiVBKrMCQKAKSzoNB4DVCAIoRQgA=}
// @noErrors: true
import type { EnhanceAppContext } from 'vitepress'
import TwoslashFloatingVue from '@shikijs/vitepress-twoslash/client' // [!code hl]
import Theme from 'vitepress/theme'

import '@shikijs/vitepress-twoslash/style.css' // [!code hl]

export default {
  extends: Theme,
  enhanceApp({ app }: EnhanceAppContext) {
    app.use(TwoslashFloatingVue) // [!code hl]
  },
}
```

--------------------------------

### Use Shorthands for Asynchronous Highlighting

Source: https://github.com/shikijs/shiki/blob/main/docs/guide/best-performance.md

Use shorthands like `codeToHtml` to reduce startup time by loading themes and languages only when needed. This is beneficial when your highlighting process can be asynchronous.

```javascript
import { codeToHtml } from 'shiki'

// Only `javascript` and `nord` will be loaded when calling `codeToHtml`
const html = await codeToHtml('const a = 1', {
  lang: 'javascript',
  theme: 'nord'
})
```

--------------------------------

### Shiki Decoration Item

Source: https://github.com/shikijs/shiki/blob/main/docs/guide/decorations.md

Defines a Shiki DecorationItem in TypeScript, specifying the start and end positions of a decoration and its properties. This is used to apply custom styling to code segments.

```typescript
import { DecorationItem } from 'shiki'

const item: DecorationItem = {
  start: { line: 0, character: 0 },
  end: { line: 0, character: -1 },
  properties: { class: 'highlighted-word' }
}
```

--------------------------------

### TypeScript Code without Twoslash Annotation

Source: https://github.com/shikijs/shiki/blob/main/packages/twoslash/test/out/markdown-it/works.html

A basic TypeScript code snippet without twoslash annotations. This example shows a simple const declaration with an inferred type.

```typescript
const a = 123
//    ^?
```

--------------------------------

### Create and Use Shiki Highlighter Synchronously

Source: https://github.com/shikijs/shiki/blob/main/docs/guide/install.md

Demonstrates how to create a Shiki highlighter instance asynchronously using `createHighlighter`, specifying themes and languages. It then shows how to use the created highlighter synchronously to convert code to HTML.

```typescript
import { createHighlighter } from 'shiki'

// `createHighlighter` is async, it initializes the internal and
// loads the themes and languages specified.
const highlighter = await createHighlighter({
  themes: ['nord'],
  langs: ['javascript'],
})

// then later you can use `highlighter.codeToHtml` synchronously
// with the loaded themes and languages.
const code = highlighter.codeToHtml('const a = 1', {
  lang: 'javascript',
  theme: 'nord'
})
```

--------------------------------

### Create Shiki Highlighter and Highlight Code (JavaScript)

Source: https://github.com/shikijs/shiki/blob/main/docs/guide/install.md

Demonstrates how to create a Shiki highlighter instance with bundled themes and languages, and then use it to convert a JavaScript code snippet to HTML with a specified theme. It imports necessary functions from 'shiki' and utilizes async/await for highlighter creation.

```javascript
import { bundledLanguages, bundledThemes, createHighlighter } from 'shiki'

const highlighter = await createHighlighter({
  themes: Object.keys(bundledThemes),
  langs: Object.keys(bundledLanguages),
})

highlighter.codeToHtml('const a = 1', {
  lang: 'javascript',
  theme: 'poimandres'
})
```

--------------------------------

### Highlight Code Range by Line/Character - TypeScript

Source: https://github.com/shikijs/shiki/blob/main/docs/guide/decorations.md

Demonstrates how to use the Shiki decorations API to highlight a specific range of code by line and character. It requires the `codeToHtml` function and accepts a `decorations` array with `start` and `end` objects, each specifying `line` and `character`. The `properties` field allows adding custom CSS classes.

```ts
import { codeToHtml } from 'shiki'

const code = `
const x = 10
console.log(x)
`.trim()

const html = await codeToHtml(code, {
  theme: 'vitesse-light',
  lang: 'ts',
  decorations: [ // [!code hl:8]
    {
      // line and character are 0-indexed
      start: { line: 1, character: 0 },
      end: { line: 1, character: 11 },
      properties: { class: 'highlighted-word' }
    }
  ]
})
```

--------------------------------

### TypeScript Code with Twoslash Annotation

Source: https://github.com/shikijs/shiki/blob/main/packages/twoslash/test/out/markdown-it/works.html

A TypeScript code snippet demonstrating the use of twoslash annotations for type checking and hover information. This example shows a const declaration with an explicit type.

```typescript
const const a: 123a = 123

```

--------------------------------

### rendererRich with type safety and error handling

Source: https://github.com/shikijs/shiki/blob/main/docs/packages/twoslash.md

Illustrates the usage of `rendererRich` in a TypeScript context, showcasing type safety with `Readonly` and potential errors like attempting to modify a read-only property. It also includes an example of `Number.parseInt`.

```ts
// @errors: 2540
interface Todo {
  title: string
}

const todo: Readonly<Todo> = {
  title: 'Delete inactive users'.toUpperCase(),
//  ^?
}

todo.title = 'Hello'

Number.parseInt('123', 10)
//      ^|
```

--------------------------------

### Node.js API: codeToANSI Conversion

Source: https://github.com/shikijs/shiki/blob/main/docs/packages/cli.md

Provides an example of using the `codeToANSI` function from the `@shikijs/cli` Node.js API. This asynchronous function converts source code into ANSI escape codes for terminal display, requiring the code, language, and theme as input.

```ts
import { codeToANSI } from '@shikijs/cli'

const highlighted = await codeToANSI(source, 'typescript', 'nord')

console.log(highlighted)
```

--------------------------------

### Initialize Shiki Highlighter with Themes and Languages (JavaScript)

Source: https://github.com/shikijs/shiki/blob/main/docs/packages/rehype.md

This snippet demonstrates how to initialize the Shiki highlighter core, specifying the themes and languages to be loaded. It also configures the Oniguruma engine for WASM.

```javascript
const highlighter = await createHighlighterCore({
  themes: [
    import('@shikijs/themes/vitesse-light')
  ],
  langs: [
    import('@shikijs/langs/javascript'),
  ],
  engine: createOnigurumaEngine(() => import('shiki/wasm'))
})
```

--------------------------------

### Basic CLI Usage

Source: https://github.com/shikijs/shiki/blob/main/docs/packages/cli.md

Shows the fundamental usage of the Shiki CLI, mimicking the 'cat' command but with syntax highlighting. It takes a file path as an argument.

```bash
npx @shikijs/cli README.md
```

--------------------------------

### Import Web Bundle - Shiki

Source: https://github.com/shikijs/shiki/blob/main/docs/guide/bundles.md

Imports the 'web' bundle of Shiki, which includes common web languages and frameworks. It then creates a highlighter instance configured with specific languages and themes.

```ts
import {
  BundledLanguage,
  BundledTheme,
  codeToHtml,
  createHighlighter
} from 'shiki/bundle/web' // [!code highlight]

const highlighter = await createHighlighter({
  langs: ['html', 'css', 'js'],
  themes: ['github-dark', 'github-light'],
})
```