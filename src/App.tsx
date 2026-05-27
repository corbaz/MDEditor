import { useState } from 'react'
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  ListsToggle,
  MDXEditor,
  UndoRedo,
  headingsPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
} from '@mdxeditor/editor'
import './App.css'

const initialMarkdown = `# MD Editor

Escribe tu markdown aqui.

- Lista
- Tareas
- Notas
`

function App() {
  const [markdown, setMarkdown] = useState(initialMarkdown)

  return (
    <main className="app">
      <header className="appHeader">
        <h1>MD Editor</h1>
      </header>
      <section className="editorWrap">
        <MDXEditor
          markdown={markdown}
          onChange={setMarkdown}
          className="editor"
          plugins={[
            headingsPlugin(),
            listsPlugin(),
            linkPlugin(),
            quotePlugin(),
            thematicBreakPlugin(),
            markdownShortcutPlugin(),
            toolbarPlugin({
              toolbarContents: () => (
                <>
                  <UndoRedo />
                  <BoldItalicUnderlineToggles />
                  <BlockTypeSelect />
                  <ListsToggle />
                  <CreateLink />
                </>
              ),
            }),
          ]}
        />
      </section>
    </main>
  )
}

export default App
