import { Router } from "express";
import {
  clearProfile,
  generateBackgroundFromResume,
  getProfileSnapshot,
  ProfileStoreError,
  saveProfile
} from "../services/profileStore.js";

export const profileRouter = Router();

profileRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await getProfileSnapshot());
  } catch (error) {
    next(error);
  }
});

profileRouter.put("/", async (req, res, next) => {
  try {
    res.json(
      await saveProfile({
        resume_filename: String(req.body.resume_filename ?? ""),
        resume_content: String(req.body.resume_content ?? ""),
        background_notes: String(req.body.background_notes ?? "")
      })
    );
  } catch (error) {
    next(error);
  }
});

profileRouter.post("/generate-background", async (req, res, next) => {
  try {
    res.json({
      background_notes: await generateBackgroundFromResume({
        resume_filename: String(req.body.resume_filename ?? ""),
        resume_content: String(req.body.resume_content ?? ""),
        existing_background_notes: String(req.body.existing_background_notes ?? "")
      })
    });
  } catch (error) {
    next(error);
  }
});

profileRouter.delete("/", async (_req, res, next) => {
  try {
    res.json(await clearProfile());
  } catch (error) {
    next(error);
  }
});

export function isProfileError(error: unknown) {
  return error instanceof ProfileStoreError;
}
