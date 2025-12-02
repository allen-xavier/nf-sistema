const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const customerRoutes = require('./routes/customers');
const companyRoutes = require('./routes/companies');
const invoiceRoutes = require('./routes/invoices');
const reportRoutes = require('./routes/reports');

const app = express();

app.use(cors());
app.use(express.json());

// Static (front simples)
app.use(express.static(path.join(__dirname, '..', 'public')));

// API
app.use('/api/auth', authRoutes);
app.use('/api/auth', authExtraRoutes);

app.use('/api/customers', customerRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/invoices', invoiceRoutes);

app.use('/api/reports', reportsRoutes); // <-- correto


// Healthcheck
app.get('/health', (req, res) => res.json({ status: 'ok' }));

module.exports = app;
