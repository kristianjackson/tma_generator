import { Menu } from "@/types/solid/menu";

const menuData: Menu[] = [
  {
    id: 1,
    title: "Home",
    newTab: false,
    path: "/",
  },
  {
    id: 2,
    title: "Generator",
    newTab: false,
    path: "/generate/step-1",
  },
  {
    id: 3,
    title: "Ingestion",
    newTab: false,
    path: "/admin/ingestion",
  },
  {
    id: 4,
    title: "Runs",
    newTab: false,
    path: "/runs",
  },
];

export default menuData;
