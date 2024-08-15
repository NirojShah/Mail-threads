const Imap = require('imap');
const { simpleParser } = require('mailparser');

const imapConfig = {
    user: 'niroj',
    password: '123456',
    host: '192.168.0.119',
    port: 143,
    tls: false
};

const imap = new Imap(imapConfig);

function openFolder(folderName, cb) {
    imap.openBox(folderName, true, (err, box) => {
        if (err) {
            console.log(`Error opening folder ${folderName}:`, err);
            return cb(err);
        }
        console.log(`Opened folder: ${folderName}, total messages: ${box.messages.total}`);
        cb(null, box);
    });
}

function fetchEmailsFromFolder(folderName, cb) {
    openFolder(folderName, (err, box) => {
        if (err) return cb(err);

        if (box.messages.total === 0) {
            console.log(`No messages found in ${folderName}`);
            return cb(null, []); 
        }

        const f = imap.seq.fetch('1:*', { bodies: '', struct: true });
        const emails = [];
        let totalMessages = box.messages.total;
        let fetchedCount = 0;

        f.on('message', (msg, seqno) => {
            console.log(`Fetching message #${seqno} from ${folderName}`);
            let emailData = '';

            msg.on('body', (stream) => {
                stream.on('data', (chunk) => {
                    emailData += chunk.toString('utf8');
                });
            });

            msg.once('end', async () => {
                try {
                    if (emailData) {
                        console.log(`Parsing message #${seqno} from ${folderName}`);
                        const parsedEmail = await simpleParser(emailData);
                        emails.push({
                            folder: folderName,
                            email: parsedEmail
                        });
                    }
                } catch (e) {
                    console.error("Error parsing email:", e);
                }
                fetchedCount++;
                if (fetchedCount === totalMessages) {
                    cb(null, emails);
                }
            });
        });

        f.once('error', (err) => {
            console.log('Fetch error: ' + err);
            cb(err, null);
        });

        f.once('end', () => {
            if (fetchedCount === totalMessages) {
                console.log(`Finished fetching emails from ${folderName}`);
            }
        });
    });
}

imap.once('ready', () => {
    let allEmails = [];

    fetchEmailsFromFolder('INBOX', (err, inboxEmails) => {
        if (err) throw err;
        allEmails = allEmails.concat(inboxEmails);
        console.log('INBOX emails:', inboxEmails); // Debugging

        fetchEmailsFromFolder('Sent', (err, sentEmails) => {
            if (err) throw err;
            allEmails = allEmails.concat(sentEmails);
            console.log('Sent emails:', sentEmails); // Debugging

            // Output the result
            console.log("Fetched Emails:", allEmails); // Debugging

            // End the connection
            imap.end();
        });
    });
});


imap.once('error', (err) => {
    console.error('IMAP error: ', err);
});

imap.once('end', () => {
    console.log('IMAP connection ended.');
});

imap.connect();
