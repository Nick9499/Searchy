import {
  deleteUser,
  getMe,
  login,
  signup,
  updateUser,
} from "@/controllers/user.controller";
import { authenticate } from "@/middlewares/auth.middleware";
import { validate } from "@/middlewares/validate.middleware";
import {
  loginSchema,
  signupSchema,
  updateUserSchema,
} from "@/validators/user.validator";
import { Router } from "express";

const router = Router();

router.post("/signup", validate(signupSchema), signup);
router.post("/login", validate(loginSchema), login);
router.get("/me", authenticate, getMe);
router.patch("/me", authenticate, validate(updateUserSchema), updateUser);
router.delete("/me", authenticate, deleteUser);

export default router;
