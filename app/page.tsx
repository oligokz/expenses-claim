'use client';

import { useState, useEffect } from 'react';

export default function ExpenseClaimForm() {
  const [rates, setRates] = useState<Record<string, number>>({});
  const [currency, setCurrency] = useState('SGD');
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  // Fetch daily currency rates against SGD
  useEffect(() => {
    async function fetchRates() {
      try {
        const res = await fetch('https://api.exchangerate-api.com/v4/latest/SGD');
        const data = await res.json();
        setRates(data.rates);
      } catch (error) {
        console.error('Failed to fetch currency rates', error);
      }
    }
    fetchRates();
  }, []);

  const calculateSgdAmount = () => {
    if (!amount || !rates[currency]) return '0.00';
    if (currency === 'SGD') return parseFloat(amount).toFixed(2);
    return (parseFloat(amount) / rates[currency]).toFixed(2);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage('');

    const formData = new FormData(e.currentTarget);
    formData.append('sgdAmount', calculateSgdAmount());

    try {
      const response = await fetch('/api/submit-claim', {
        method: 'POST',
        body: formData, // Sending as FormData to handle the file upload
      });

      if (response.ok) {
        setMessage('Expense claim submitted successfully! Check your email.');
        (e.target as HTMLFormElement).reset();
      } else {
        setMessage('Failed to submit claim. Please try again.');
      }
    } catch (error) {
      setMessage('An error occurred during submission.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="max-w-2xl mx-auto p-8 font-sans">
      <h1 className="text-2xl font-bold mb-6">Submit Expense Claim</h1>
      
      <form onSubmit={handleSubmit} className="space-y-4 bg-white p-6 rounded-lg shadow">
        
        <div>
          <label className="block text-sm font-medium mb-1">Full Name</label>
          <input type="text" name="name" required className="w-full border p-2 rounded" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Employee Email</label>
          <input type="email" name="email" required className="w-full border p-2 rounded" />
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">Currency</label>
            <select 
              name="currency" 
              value={currency} 
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full border p-2 rounded"
            >
              <option value="SGD">SGD</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="MYR">MYR</option>
              <option value="IDR">IDR</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">Amount</label>
            <input 
              type="number" 
              name="amount" 
              step="0.01" 
              required 
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border p-2 rounded" 
            />
          </div>
        </div>

        <div className="bg-gray-50 p-3 rounded text-sm text-gray-700">
          <strong>Converted SGD Amount:</strong> ${calculateSgdAmount()}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Expense Description</label>
          <textarea name="description" required className="w-full border p-2 rounded" rows={3}></textarea>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Upload Receipt (PDF/Image)</label>
          <input type="file" name="receipt" accept="image/*,.pdf" required className="w-full border p-2 rounded" />
        </div>

        <button 
          type="submit" 
          disabled={isSubmitting}
          className="w-full bg-blue-600 text-white font-bold py-2 px-4 rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          {isSubmitting ? 'Submitting...' : 'Submit Claim'}
        </button>

        {message && <p className="mt-4 text-center font-medium">{message}</p>}
      </form>
    </main>
  );
}
