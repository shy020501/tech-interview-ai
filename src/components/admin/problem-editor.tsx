"use client";

import { useState, type FormEvent } from "react";
import type { ProblemPublic } from "@/types/problem";

export function ProblemEditor({ problem }: { problem: ProblemPublic }) {
  const [draft, setDraft] = useState({ title: problem.title, shortDescription: problem.shortDescription, scenario: problem.scenario, question: problem.question });
  const [saved, setSaved] = useState(draft);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (Object.values(draft).some((value) => !value.trim())) { setError("All public content fields are required."); return; }
    setError(""); setSaved(draft); setNotice("Local preview updated. The catalog and published version are unchanged.");
  }
  return <section className="panel section-padding"><p className="eyebrow">Public content</p><h2 className="mt-2">Draft editor</h2><p className="muted text-sm mt-2">Content is loaded from the database. Edits only update this local preview; saving versions and publishing will be added in a future update.</p><form onSubmit={save} className="space-y-4 mt-5">{([{ key: "title", label: "Title", rows: 1 }, { key: "shortDescription", label: "Short description", rows: 2 }, { key: "scenario", label: "Scenario", rows: 4 }, { key: "question", label: "Question", rows: 3 }] as const).map((field) => <div key={field.key}><label htmlFor={`edit-${field.key}`}>{field.label}</label><textarea id={`edit-${field.key}`} rows={field.rows} required maxLength={4000} value={draft[field.key]} onChange={(event) => { setDraft({ ...draft, [field.key]: event.target.value }); setError(""); }} /></div>)}{error && <p role="alert" className="error-text">{error}</p>}<div className="flex flex-wrap gap-3"><button type="submit" className="button button-primary">Update local preview</button><button type="button" className="button button-secondary" onClick={() => { const original = { title: problem.title, shortDescription: problem.shortDescription, scenario: problem.scenario, question: problem.question }; setDraft(original); setSaved(original); setError(""); setNotice("Local edits reset."); }}>Reset edits</button></div><p role="status" className="muted text-sm">{notice}</p></form><div className="public-preview"><p className="eyebrow">User content preview</p><h3 className="mt-3">{saved.title}</h3><p className="muted mt-2">{saved.shortDescription}</p><p className="mt-4">{saved.scenario}</p><p className="font-medium mt-4">{saved.question}</p></div></section>;
}
