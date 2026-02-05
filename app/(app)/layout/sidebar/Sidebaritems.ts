import { uniqueId } from 'lodash'

export interface ChildItem {
  id?: number | string
  name?: string
  icon?: any
  children?: ChildItem[]
  item?: any
  url?: any
  color?: string
  disabled?: boolean
  subtitle?: string
  badge?: boolean
  badgeType?: string
  isPro?: boolean
}

export interface MenuItem {
  heading?: string
  name?: string
  icon?: any
  id?: number
  to?: string
  items?: MenuItem[]
  children?: ChildItem[]
  url?: any
  disabled?: boolean
  subtitle?: string
  badgeType?: string
  badge?: boolean
  isPro?: boolean
}

const SidebarContent: MenuItem[] = [
  {
    heading: 'Workspace',
    children: [
      {
        name: 'Dashboard',
        icon: 'solar:widget-2-linear',
        id: uniqueId(),
        url: '/dashboard',
      },
      {
        name: 'Runs',
        icon: 'solar:history-2-linear',
        id: uniqueId(),
        url: '/runs',
      },
    ],
  },
  {
    heading: 'Generator',
    children: [
      {
        name: 'New run',
        icon: 'solar:magic-stick-3-linear',
        id: uniqueId(),
        url: '/generate/step-1',
      },
      {
        name: 'Outline',
        icon: 'solar:notes-linear',
        id: uniqueId(),
        url: '/generate/step-2',
      },
      {
        name: 'Draft',
        icon: 'solar:document-text-linear',
        id: uniqueId(),
        url: '/generate/step-3',
      },
    ],
  },
  {
    heading: 'Admin',
    children: [
      {
        name: 'Admin home',
        icon: 'solar:shield-user-linear',
        id: uniqueId(),
        url: '/admin',
      },
      {
        name: 'Ingestion',
        icon: 'solar:database-linear',
        id: uniqueId(),
        url: '/admin/ingestion',
      },
    ],
  },
  {
    heading: 'Account',
    children: [
      {
        id: uniqueId(),
        name: 'Profile',
        icon: 'solar:user-circle-linear',
        url: '/profile',
      },
    ],
  },
]

export default SidebarContent
