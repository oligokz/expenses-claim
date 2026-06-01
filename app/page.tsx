// app/components/ExpenseForm.tsx
'use client';

import { useState, FormEvent, useRef } from 'react';

export default function ExpenseForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage('');

    const formData = new FormData(e.currentTarget);

    try {
      const response = await fetch('/api/submit-expense', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Submission failed');
      
      setMessage('✅ Expense claim submitted successfully!');
      formRef.current?.reset();
      setFileName(null); // Reset the file name display
    } catch (error) {
      console.error(error);
      setMessage('❌ An error occurred while submitting the claim.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto mt-10 bg-white p-8 rounded-xl shadow-sm border border-gray-200">
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold text-gray-800">Expense Claim</h2>
        <p className="text-sm text-gray-500 mt-1">Fill out the details below to request reimbursement.</p>
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
        {/* Description Field */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Description</label>
          <input 
            type="text" 
            name="title" 
            placeholder="e.g., Client Dinner, Server Hosting" 
            required 
            className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
          />
        </div>

        {/* Amount and Currency Row */}
        <div className="flex gap-4">
          <div className="flex-[2]">
            <label className="block text-sm font-semibold text-gray-700 mb-1">Amount</label>
            <input 
              type="number" 
              step="0.01" 
              name="amount" 
              placeholder="0.00"
              required 
              className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
            />
          </div>
          <div className="flex-[1]">
            <label className="block text-sm font-semibold text-gray-700 mb-1">Currency</label>
            <select 
              name="currency" 
              required 
              className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white cursor-pointer transition-all"
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="SGD">SGD</option>
            </select>
          </div>
        </div>

        {/* Custom File Upload Area */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Receipt (PDF/Image)</label>
          <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center hover:bg-gray-50 hover:border-blue-400 transition-colors cursor-pointer group">
            
            {/* Hidden actual file input */}
            <input 
              type="file" 
              name="receipt" 
              accept=".pdf,image/*" 
              required 
              onChange={(e) => setFileName(e.target.files?.[0]?.name || null)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
            />
            
            {/* Visual Upload UI */}
            <svg className="w-8 h-8 text-gray-400 group-hover:text-blue-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <p className="text-sm text-gray-600 font-medium">
              {fileName ? <span className="text-blue-600">{fileName}</span> : 'Click to upload or drag and drop'}
            </p>
            {!fileName && <p className="text-xs text-gray-400 mt-1">SVG, PNG, JPG or PDF (MAX. 4MB)</p>}
          </div>
        </div>

        {/* Submit Button */}
        <button 
          type="submit" 
          disabled={isSubmitting}
          className="w-full bg-blue-600 text-white font-semibold p-3 rounded-lg hover:bg-blue-700 active:bg-blue-800 focus:ring-4 focus:ring-blue-200 disabled:opacity-70 disabled:cursor-not-allowed transition-all mt-2"
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing...
            </span>
          ) : 'Submit Claim'}
        </button>

        {/* Feedback Message */}
        {message && (
          <div className={`p-3 rounded-lg text-sm text-center font-medium ${message.includes('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {message}
          </div>
        )}
      </form>
    </div>
  );
}
