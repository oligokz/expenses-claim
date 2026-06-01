// app/components/ExpenseForm.tsx
'use client';

import { useState, FormEvent } from 'react';

export default function ExpenseForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage('');

    // Capture all form data, including the file
    const formData = new FormData(e.currentTarget);

    try {
      const response = await fetch('/api/submit-expense', {
        method: 'POST',
        body: formData, // Sending as multipart/form-data
      });

      if (!response.ok) throw new Error('Submission failed');
      
      setMessage('Expense claim submitted successfully!');
      (e.target as HTMLFormElement).reset();
    } catch (error) {
      console.error(error);
      setMessage('An error occurred while submitting the claim.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto space-y-4 p-4 border rounded shadow">
      <div>
        <label className="block text-sm font-medium">Description</label>
        <input type="text" name="title" required className="w-full border p-2 rounded" />
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium">Amount</label>
          <input type="number" step="0.01" name="amount" required className="w-full border p-2 rounded" />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium">Currency</label>
          <select name="currency" required className="w-full border p-2 rounded">
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="SGD">SGD</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium">Receipt (PDF/Image)</label>
        <input type="file" name="receipt" accept=".pdf,image/*" required className="w-full border p-2 rounded" />
      </div>

      <button 
        type="submit" 
        disabled={isSubmitting}
        className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {isSubmitting ? 'Submitting...' : 'Submit Claim'}
      </button>

      {message && <p className="text-sm text-center mt-2">{message}</p>}
    </form>
  );
}
