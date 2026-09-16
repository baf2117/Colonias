import { Layout, type LayoutProps } from 'react-admin'
import { AppMenu } from './AppMenu'
import { AppSidebar } from './AppSidebar'
import { AppTopBar } from './AppTopBar'

export function AppLayout(props: LayoutProps) {
  return <Layout {...props} appBar={AppTopBar} menu={AppMenu} sidebar={AppSidebar} />
}
