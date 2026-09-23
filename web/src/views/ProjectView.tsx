import { useParams } from 'react-router-dom'
import { Page } from '../components/Page'
import { useData } from '../hooks'

export function ProjectView({ id: fixed }: { id?: string }) {
  const { id = fixed } = useParams()
  const data = useData()
  const project = id ? data.projects[id] : undefined
  return <Page title={project?.name ?? 'Project'}>{null}</Page>
}

export function Inbox() {
  const data = useData()
  return <ProjectView id={Object.values(data.projects).find((p) => p.inbox)?.id} />
}
