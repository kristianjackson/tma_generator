"use client";

import { useEffect, useRef } from "react";

type SelectAllCheckboxProps = {
  group: string;
  label?: string;
};

const getCheckboxes = (group: string) => {
  const container = document.querySelector(`[data-select-group="${group}"]`);
  if (!container) {
    return [] as HTMLInputElement[];
  }
  return Array.from(
    container.querySelectorAll<HTMLInputElement>('input[name="selectedIds"]')
  );
};

export default function SelectAllCheckbox({
  group,
  label
}: SelectAllCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const boxes = getCheckboxes(group);
    if (!boxes.length) {
      return;
    }

    const update = () => {
      const checkedCount = boxes.filter((box) => box.checked).length;
      const allChecked = checkedCount === boxes.length;
      const noneChecked = checkedCount === 0;

      if (ref.current) {
        ref.current.checked = allChecked;
        ref.current.indeterminate = !allChecked && !noneChecked;
      }
    };

    boxes.forEach((box) => box.addEventListener("change", update));
    update();

    return () => {
      boxes.forEach((box) => box.removeEventListener("change", update));
    };
  }, [group]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.checked;
    const boxes = getCheckboxes(group);
    boxes.forEach((box) => {
      box.checked = nextValue;
    });

    if (ref.current) {
      ref.current.indeterminate = false;
    }
  };

  return (
    <label className="checkbox-header">
      <input
        ref={ref}
        className="checkbox"
        type="checkbox"
        onChange={handleChange}
      />
      {label ? <span>{label}</span> : null}
    </label>
  );
}
