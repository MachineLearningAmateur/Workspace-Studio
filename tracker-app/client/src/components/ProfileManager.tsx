import type { ChangeEvent } from "react";
import { useEffect, useState } from "react";
import { clearProfile, generateProfileBackground, getProfile, saveProfile } from "../api/trackerApi";
import type { ProfileSnapshot } from "../types/tracker";

export function ProfileManager() {
  const [profile, setProfile] = useState<ProfileSnapshot | null>(null);
  const [resumeFilename, setResumeFilename] = useState("");
  const [resumeContent, setResumeContent] = useState("");
  const [backgroundNotes, setBackgroundNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    void loadProfile();
  }, []);

  async function loadProfile() {
    setError(null);

    try {
      const snapshot = await getProfile();
      setProfile(snapshot);
      setResumeFilename(snapshot.resume_filename);
      setResumeContent(snapshot.resume_content);
      setBackgroundNotes(snapshot.background_notes);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load profile");
    }
  }

  async function readResumeFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setStatus(null);

    try {
      if (!/\.(md|txt|docx)$/i.test(file.name)) {
        throw new Error("Upload a .docx, .md, or .txt resume, or paste resume text into the editor.");
      }

      setResumeFilename(file.name);
      setResumeContent(await readResumeText(file));
      setStatus(`Loaded ${file.name}. Save the profile to use it in Codex prompts.`);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "Unable to read resume file");
    } finally {
      event.target.value = "";
    }
  }

  async function save() {
    setIsSaving(true);
    setError(null);
    setStatus(null);

    try {
      const snapshot = await saveProfile({
        resume_filename: resumeFilename,
        resume_content: resumeContent,
        background_notes: backgroundNotes
      });
      setProfile(snapshot);
      setStatus("Profile saved. Codex will use this context in Open Chat and Guided Sessions.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save profile");
    } finally {
      setIsSaving(false);
    }
  }

  async function generateNotes() {
    if (!resumeContent.trim()) {
      setError("Add resume text before generating background notes.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setStatus(null);

    try {
      const result = await generateProfileBackground({
        resume_filename: resumeFilename,
        resume_content: resumeContent,
        existing_background_notes: backgroundNotes
      });
      setBackgroundNotes(result.background_notes);
      setStatus("Generated background notes from the resume. Review and save the profile to use them in Codex prompts.");
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Unable to generate background notes");
    } finally {
      setIsGenerating(false);
    }
  }

  async function clear() {
    if (!window.confirm("Clear saved resume and background context?")) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setStatus(null);

    try {
      const snapshot = await clearProfile();
      setProfile(snapshot);
      setResumeFilename("");
      setResumeContent("");
      setBackgroundNotes("");
      setStatus("Profile cleared.");
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Unable to clear profile");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="profile-manager" aria-label="Profile and resume">
      <div className="section-heading">
        <div>
          <h2>Profile</h2>
          <p>Save resume and background context so Codex can tailor plans, STAR stories, and interview guidance.</p>
        </div>
      </div>

      {error ? (
        <section className="alert" role="alert">
          {error}
        </section>
      ) : null}
      {status ? <p className="success-message">{status}</p> : null}

      <div className="profile-grid">
        <section className="profile-panel">
          <div className="section-heading compact-heading">
            <div>
              <h3>Resume</h3>
              <p>Upload `.docx`, `.md`, or `.txt`, or paste a text version of your resume.</p>
            </div>
            <label className="button-like ghost-button">
              Upload resume
              <input
                type="file"
                accept=".docx,.md,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
                onChange={(event) => void readResumeFile(event)}
              />
            </label>
          </div>
          <label>
            Resume filename
            <input value={resumeFilename} onChange={(event) => setResumeFilename(event.target.value)} placeholder="resume.md" />
          </label>
          <label>
            Resume text
            <textarea
              rows={16}
              value={resumeContent}
              onChange={(event) => setResumeContent(event.target.value)}
              placeholder="Paste your resume text here."
            />
          </label>
        </section>

        <section className="profile-panel">
          <div className="section-heading compact-heading">
            <div>
              <h3>Background Notes</h3>
              <p>Add context Codex should use for STAR prep and behavioral coaching.</p>
            </div>
            <button className="ghost-button" type="button" disabled={isGenerating || !resumeContent.trim()} onClick={() => void generateNotes()}>
              {isGenerating ? "Generating..." : "Generate from resume"}
            </button>
          </div>
          <label>
            Notes
            <textarea
              rows={22}
              value={backgroundNotes}
              onChange={(event) => setBackgroundNotes(event.target.value)}
              placeholder="Projects, wins, failures, leadership examples, target roles, companies, constraints, or stories to reuse."
            />
          </label>
        </section>
      </div>

      <div className="profile-actions">
        <div>
          <span>Saved profile</span>
          <strong>{profile?.updated_at ? `Updated ${formatTime(profile.updated_at)}` : "Not saved yet"}</strong>
          {profile?.path ? <code>{profile.path}</code> : null}
        </div>
        <div className="form-actions">
          <button className="danger-button" type="button" disabled={isSaving} onClick={() => void clear()}>
            Clear profile
          </button>
          <button className="primary-button" type="button" disabled={isSaving || isGenerating} onClick={() => void save()}>
            {isSaving ? "Saving..." : "Save profile"}
          </button>
        </div>
      </div>
    </section>
  );
}

function formatTime(value: string) {
  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

async function readResumeText(file: File) {
  if (/\.docx$/i.test(file.name)) {
    const mammoth = (await import("mammoth")).default;
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value.trim();
  }

  return file.text();
}
