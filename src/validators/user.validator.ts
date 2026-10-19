import { z } from "zod";

export const signupSchema = z.object({
  name: z.string().min(2, "Name must be atleast 2 characters"),
  email: z.email("Invalid email address"),
  password: z.string().min(8, "password must be atleast 8 characters"),
});

export const loginSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(1, "password is required"),
});

export const updateUserSchema = z
  .object({
    name: z.string().min(2).optional(),
    email: z.email().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    error: "At least one field must be provided",
  });

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
