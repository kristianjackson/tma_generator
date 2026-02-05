import clsx from "clsx";

type CardBoxProps = {
  children: React.ReactNode;
  className?: string;
};

export default function CardBox({ children, className }: CardBoxProps) {
  return (
    <div className={clsx("rounded-2xl bg-white p-6 shadow-sm", className)}>
      {children}
    </div>
  );
}
