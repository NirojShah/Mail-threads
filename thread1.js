const Imap = require('imap');
const { simpleParser } = require('mailparser');

// Configure the IMAP connection with provided credentials
const imap = new Imap({
  user: 'niroj',                 // Your IMAP username
  password: '123456',             // Your IMAP password
  host: '192.168.0.119',          // Your IMAP server IP
  port: 143,                      // IMAP port (without TLS)
  tls: false                      // TLS disabled
});

// Function to open a specific mailbox (INBOX, Sent, etc.)
function openMailbox(folder) {
  return new Promise((resolve, reject) => {
    imap.openBox(folder, true, (err, box) => {
      if (err) {
        console.error(`Failed to open mailbox: ${folder}`, err);
        reject(err);
      } else {
        console.log(`Opened mailbox: ${folder}`);
        resolve(box);
      }
    });
  });
}

// Function to search for emails related to a specific Message-ID
function searchRelatedEmails(searchField, messageId) {
  return new Promise((resolve, reject) => {
    imap.search([['HEADER', searchField, messageId]], (err, results) => {
      if (err) {
        console.error(`Failed to search emails by ${searchField}`, err);
        reject(err);
      } else {
        console.log(`Found ${results.length} emails for ${searchField}: ${messageId}`);
        resolve(results);
      }
    });
  });
}

// Function to fetch email bodies based on a list of UIDs
function fetchEmailsByUIDs(uids) {
  console.log('Fetching emails with UIDs:', uids);

  return new Promise((resolve, reject) => {
    if (uids.length === 0) {
      resolve([]); // No emails to fetch
      return;
    }

    const fetch = imap.fetch(uids, { bodies: '', struct: true });

    const emails = [];

    fetch.on('message', (msg, seqno) => {
      console.log(`Processing message ${seqno}`);
      msg.on('body', (stream, info) => {
        console.log('Message info:', info); // Log message info for debugging

        let buffer = '';
        stream.on('data', (chunk) => {
          buffer += chunk.toString('utf8');
        });

        stream.once('end', () => {
          console.log(`Fetched body content: ${buffer}`); // Log the fetched body content
          simpleParser(buffer, (err, parsed) => {
            if (err) {
              console.error('Error parsing email:', err);
            } else {
              console.log(`Parsed email with subject: ${parsed.subject}`);
              console.log(`Parsed email with Message-ID: ${parsed.messageId}`);
              console.log(`Parsed email References: ${parsed.references}`);
              console.log(`Parsed email In-Reply-To: ${parsed.inReplyTo}`);
              emails.push(parsed);
            }
          });
        });
      });
    });

    fetch.on('end', () => {
      console.log('Fetch ended with emails:', emails.length);
      resolve(emails);
    });

    fetch.on('error', (err) => {
      console.error('Fetch error:', err);
      reject(err);
    });
  });
}

// Function to fetch related emails from both INBOX and Sent
async function fetchThreadRelatedEmails(initialMessageId) {
  const folders = ['INBOX', 'Sent'];  // Folders to search in
  let relatedEmails = [];

  for (const folder of folders) {
    try {
      await openMailbox(folder);

      // Search emails by 'In-Reply-To' and 'References' headers
      const inReplyToResults = await searchRelatedEmails('In-Reply-To', initialMessageId);
      const referencesResults = await searchRelatedEmails('References', initialMessageId);

      const allResults = [...new Set([...inReplyToResults, ...referencesResults])]; // Combine results and remove duplicates

      console.log(`Combined results: ${allResults}`);

      // Fetch the related emails based on the search results
      const emails = await fetchEmailsByUIDs(allResults);
      relatedEmails = relatedEmails.concat(emails);
    } catch (err) {
      console.error(`Error processing folder: ${folder}`, err);
    }
  }

  return relatedEmails;
}

// Connect and fetch related emails
imap.once('ready', async () => {
  try {
    // Provide the initial Message-ID to start the thread search
    const initialMessageId = '<6dbd362d-105d-48fe-9f69-19771e9899c9@qugates.in>';  // Replace this with the actual Message-ID you want to search for
    console.log('IMAP connection established');

    const relatedEmails = await fetchThreadRelatedEmails(initialMessageId);

    // Display related email subjects
    if (relatedEmails.length === 0) {
      console.log('No related emails found.');
    } else {
      relatedEmails.forEach((email) => {
        console.log('Subject:', email.subject);
        console.log('Body:', email.text); // Output the email body for verification
      });
    }

    imap.end();
  } catch (error) {
    console.error('Error during IMAP processing:', error);
    imap.end();
  }
});

imap.once('error', (err) => {
  console.error('IMAP error:', err);
});

imap.once('end', () => {
  console.log('IMAP connection ended');
});

// Connect to the IMAP server
imap.connect();
