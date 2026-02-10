
# Contact Page Architecture

This document outlines the architecture of the refactored Contact page.

## Overview

The `Contact.tsx` page has been refactored to improve maintainability, scalability, and professionalism. The main goals of the refactoring were to:

-   Separate concerns by breaking down the page into smaller, more manageable components.
-   Externalize hardcoded data to make content updates easier.
-   Implement proper form handling and validation.

## File Structure

The new file structure for the contact page components is as follows:

```
src
├── components
│   └── features
│       └── contact
│           ├── ContactForm.tsx
│           ├── ContactInfoSection.tsx
│           ├── DepartmentsSection.tsx
│           └── FaqSection.tsx
├── lib
│   └── contact-data.ts
└── pages
    └── Contact.tsx
```

## Components

### `pages/Contact.tsx`

This is the main layout component for the contact page. It assembles the different sections of the page, which are now implemented as separate components.

### `components/features/contact/ContactForm.tsx`

This component contains the contact form. It uses `react-hook-form` for form state management and `zod` for schema-based validation. The form submission logic is handled within this component.

### `components/features/contact/ContactInfoSection.tsx`

This component displays the contact information, including email, phone, and address. It also includes the "Quick Actions" and "Support Hours" sections.

### `components/features/contact/DepartmentsSection.tsx`

This component displays the different company departments that can be contacted.

### `components/features/contact/FaqSection.tsx`

This component displays the Frequently Asked Questions (FAQ) section.

## Data

### `lib/contact-data.ts`

All the data that was previously hardcoded in the `Contact.tsx` component has been moved to this file. This includes the contact information, department details, and FAQ items. This centralization makes it easy to update the content without touching the component code.

## Form Handling

The contact form now uses `react-hook-form` to manage its state and `zod` to define the validation schema. This provides a robust and reliable way to handle form submissions.

The form validation schema is defined in `ContactForm.tsx`. The `onSubmit` function in the same file contains the logic for handling the form submission. Currently, it logs the form data to the console and shows an alert.
