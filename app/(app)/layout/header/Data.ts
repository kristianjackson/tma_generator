
import { IconUser, IconMail, IconListCheck, IconProps, Icon} from '@tabler/icons-react';

//  Profile Data
interface ProfileType {
  title: string;
  img: any;
  subtitle: string;
  url: string;
  icon:string
}


const profileDD: ProfileType[] = [
  {
    img: "/images/svgs/icon-account.svg",
    title: "Profile",
    subtitle: "Account settings",
    icon:"tabler:user",
    url: "/profile",
  },
  {
    img: "/images/svgs/icon-inbox.svg",
    title: "Saved Runs",
    subtitle: "Generated stories",
    icon:"tabler:mail",
    url: "/runs",
  },
  {
    img: "/images/svgs/icon-tasks.svg",
    title: "Ingestion",
    subtitle: "Transcripts & metadata",
    icon:"tabler:list-check",
    url: "/admin/ingestion",
  },
];

const Notifications = [
  {
    title: "Roman Joined the Team!",
    subtitle: "Congratulate him",
  },
  {
    title: "New message",
    subtitle: "Salma sent you new message",
  },
  {
    title: "Bianca sent payment",
    subtitle: "Check your earnings",
  },
  {
    title: "Jolly completed tasks",
    subtitle: "Assign her new tasks",
  },
  {
    title: "John received payment",
    subtitle: "$230 deducted from account",
  },
];

export {
  Notifications,
  profileDD,
};
