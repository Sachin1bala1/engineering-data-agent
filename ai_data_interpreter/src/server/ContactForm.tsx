import React from "react";

interface ContactFormProps {
  email?: string;
}

export function ContactForm({
  email = "sachin1bala1@gmail.com",
}: ContactFormProps) {
  return (
    <div className="max-w-md mx-auto p-4 text-center">
      <h2 className="text-2xl font-bold mb-4">Contact Me</h2>
      <p className="text-lg">
        You can reach me at:{" "}
        <a
          href={`mailto:${email}`}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {email}
        </a>
      </p>
    </div>
  );
}
