'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Icon } from '@iconify/react'
import * as profileData from './Data'
import SimpleBar from 'simplebar-react'
import { Button } from '@/components/ui/button'
import { SignOutButton } from "@clerk/nextjs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

const Profile = () => {
  return (
    <div className='relative group/menu ps-15 shrink-0'>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <span className='hover:text-primary hover:bg-lightprimary rounded-full flex justify-center items-center cursor-pointer group-hover/menu:bg-lightprimary group-hover/menu:text-primary'>
            <Image
              src='/images/profile/user-1.jpg'
              alt='logo'
              height={35}
              width={35}
              className='rounded-full'
            />
          </span>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align='end'
          className='w-screen sm:w-[220px] pb-4 pt-2 rounded-sm bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100 border border-defaultBorder'>
          <SimpleBar>
            {profileData.profileDD.map((item, index) => (
              <DropdownMenuItem key={index} asChild>
                <Link
                  href={item.url}
                  className='px-4 py-2 flex justify-between items-center group/link w-full text-slate-900 dark:text-slate-100 hover:bg-lightprimary hover:text-primary'>
                  <div className='flex items-center gap-3 w-full'>
                    <Icon
                      icon={item.icon}
                      className='text-lg text-slate-600 dark:text-slate-200 group-hover/link:text-primary'
                    />
                    <h5 className='mb-0 text-sm text-slate-700 dark:text-slate-100 group-hover/link:text-primary'>
                      {item.title}
                    </h5>
                  </div>
                </Link>
              </DropdownMenuItem>
            ))}
          </SimpleBar>

          <DropdownMenuSeparator className='my-2' />

          <div className='px-4'>
            <SignOutButton redirectUrl="/login">
              <Button variant='outline' className='w-full rounded-full'>
                Sign out
              </Button>
            </SignOutButton>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export default Profile
