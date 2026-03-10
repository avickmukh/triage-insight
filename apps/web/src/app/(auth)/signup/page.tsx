
'use client';

import { Button } from "@/components/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shared/ui/card";
import { Input } from "@/components/shared/ui/input";
import { Label } from "@/components/shared/ui/label";
import { useAuth } from "@/lib/auth";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const signupSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type SignupFormValues = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const { signUp } = useAuth();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
  });

  const onSubmit = (data: SignupFormValues) => {
    signUp(data);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <Card className="mx-auto max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Sign Up</CardTitle>
          <CardDescription>
            Enter your information to create an account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="first-name">First name</Label>
                <Input id="first-name" placeholder="Max" {...register("firstName")} />
                {errors.firstName && <p className="text-red-500 text-xs">{errors.firstName.message}</p>}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="last-name">Last name</Label>
                <Input id="last-name" placeholder="Robinson" {...register("lastName")} />
                {errors.lastName && <p className="text-red-500 text-xs">{errors.lastName.message}</p>}
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                {...register("email")}
              />
              {errors.email && <p className="text-red-500 text-xs">{errors.email.message}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" {...register("password")} />
              {errors.password && <p className="text-red-500 text-xs">{errors.password.message}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Creating account...' : 'Create an account'}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            Already have an account?{" "}
            <Link href="/login" className="underline">
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
