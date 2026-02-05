"use client";

import { useState } from "react";
import { buildExportName } from "@/app/lib/export";

type ExportActionsProps = {
  label: string;
  content: string;
  filenameBase: string;
};

const copyToClipboard = async (text: string) => {
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
};

const downloadFile = (filename: string, text: string) => {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

export default function ExportActions({
  label,
  content,
  filenameBase
}: ExportActionsProps) {
  const [status, setStatus] = useState("");

  const handleCopy = async () => {
    try {
      await copyToClipboard(content);
      setStatus("Copied!");
      setTimeout(() => setStatus(""), 1500);
    } catch {
      setStatus("Copy failed");
      setTimeout(() => setStatus(""), 1500);
    }
  };

  const handleDownload = (ext: "txt" | "md") => {
    const filename = buildExportName(filenameBase, ext);
    downloadFile(filename, content);
  };

  return (
    <div className="export-actions">
      <span className="export-label">{label}</span>
      <div className="actions">
        <button className="ghost" type="button" onClick={handleCopy}>
          Copy
        </button>
        <button className="ghost" type="button" onClick={() => handleDownload("txt")}>
          Download .txt
        </button>
        <button className="ghost" type="button" onClick={() => handleDownload("md")}>
          Download .md
        </button>
        {status ? <span className="export-status">{status}</span> : null}
      </div>
    </div>
  );
}
