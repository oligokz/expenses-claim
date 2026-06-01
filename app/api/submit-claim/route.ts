import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';

// Initialize Email Client (Resend is highly recommended for Vercel)
const resend = new Resend(process.env.RESEND_API_KEY);

// Helper to initialize Microsoft Graph Client
function getGraphClient() {
  const credential = new ClientSecretCredential(
    process.env.AZURE_TENANT_ID!,
    process.env.AZURE_CLIENT_ID!,
    process.env.AZURE_CLIENT_SECRET!
  );
  
  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => {
        const token = await credential.getToken('https://graph.microsoft.com/.default');
        return token.token;
      }
    }
  });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    
    // 1. Extract Form Data
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const currency = formData.get('currency') as string;
    const amount = formData.get('amount') as string;
    const sgdAmount = formData.get('sgdAmount') as string;
    const description = formData.get('description') as string;
    const receipt = formData.get('receipt') as File;

    // 2. Generate Unique Linkage ID
    const claimId = `CLAIM-${Date.now()}`;
    
    // 3. Prepare File for SharePoint
    const fileBuffer = Buffer.from(await receipt.arrayBuffer());
    const fileExtension = receipt.name.split('.').pop();
    const sharePointFileName = `${claimId}.${fileExtension}`;

    // --- SHAREPOINT INTEGRATION (Requires Azure AD Setup) ---
    /* const graphClient = getGraphClient();
    const siteId = process.env.SHAREPOINT_SITE_ID;
    const listId = process.env.SHAREPOINT_LIST_ID;
    const driveId = process.env.SHAREPOINT_DRIVE_ID;

    // A. Upload Receipt to SharePoint Document Library
    const uploadResult = await graphClient
      .api(`/sites/${siteId}/drives/${driveId}/root:/Expenses/${sharePointFileName}:/content`)
      .put(fileBuffer);

    // B. Add Data to SharePoint List
    await graphClient.api(`/sites/${siteId}/lists/${listId}/items`).post({
      fields: {
        Title: claimId,
        EmployeeName: name,
        EmployeeEmail: email,
        OriginalAmount: amount,
        Currency: currency,
        SGDAmount: sgdAmount,
        Description: description,
        ReceiptLink: uploadResult.webUrl // Links the list item to the exact file
      }
    });
    */

    // 4. Send Confirmation Email to User
    await resend.emails.send({
      from: 'Finance <finance@yourcompany.com>',
      to: email,
      subject: `Expense Claim Received: ${claimId}`,
      html: `
        <h2>Expense Claim Submitted</h2>
        <p>Hi ${name},</p>
        <p>Your expense claim has been successfully recorded. Here are your details for your tracking:</p>
        <ul>
          <li><strong>Claim ID:</strong> ${claimId}</li>
          <li><strong>Amount:</strong> ${amount} ${currency}</li>
          <li><strong>Converted SGD:</strong> $${sgdAmount}</li>
          <li><strong>Description:</strong> ${description}</li>
        </ul>
        <p>HR will process this shortly. Thank you!</p>
      `,
    });

    return NextResponse.json({ success: true, claimId });

  } catch (error) {
    console.error('Submission Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
