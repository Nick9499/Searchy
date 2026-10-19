import { env } from "@/config/env";
import { db } from "@/db";
import { users } from "@/db/schema";
import { AuthRequest } from "@/middlewares/auth.middleware";
import {
  LoginInput,
  SignupInput,
  UpdateUserInput,
} from "@/validators/user.validator";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";

export const signup = async (req: Request, res: Response) => {
  const body = req.body as SignupInput;

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, body.email));

  if (existing.length > 0) {
    res.status(409).json({ message: "Email already in use" });
    return;
  }

  const hashedPassword = await bcrypt.hash(body.password, 10);

  const [user] = await db
    .insert(users)
    .values({
      name: body.name,
      email: body.name,
      password: hashedPassword,
    })
    .returning();

  res.status(201).json({ message: "Account created", userId: user.id });
};

export const login = async (req: Request, res: Response) => {
  const body = req.body as LoginInput;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, body.email));

  if (!user) {
    res.status(401).json({ message: "Invalid Credentials" });
    return;
  }

  const isMatch = await bcrypt.compare(body.password, user.password);

  if (!isMatch) {
    res.status(401).json({ message: "Invalid Credentials" });
    return;
  }

  const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, {
    expiresIn: "7d",
  });

  res.json({ token });
};

export const getMe = async (req: AuthRequest, res: Response) => {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, req.userId!));

  if (!user) {
    res.status(401).json({ message: "User not found" });
    return;
  }

  res.json({ user });
};

export const updateUser = async (req: AuthRequest, res: Response) => {
  const body = req.body as UpdateUserInput;

  if (body.email) {
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, body.email));

    if (existing && existing.id !== req.userId) {
      res.status(409).json({ message: "Email already in use" });
      return;
    }
  }

  const [updated] = await db
    .update(users)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(users.id, req.userId!))
    .returning();

  res.json({ user: updated });
};

export const deleteUser = async (req: AuthRequest, res: Response) => {
  await db.delete(users).where(eq(users.id, req.userId!));
  res.json({ message: "Account deleted" });
};
