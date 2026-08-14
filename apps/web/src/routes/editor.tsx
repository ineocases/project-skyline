import { createFileRoute } from '@tanstack/react-router'
import { CompositionEditor } from '../components/composition/CompositionEditor'

export const Route = createFileRoute('/editor')({ component: Editor })

function Editor() {
  return <CompositionEditor />
}
