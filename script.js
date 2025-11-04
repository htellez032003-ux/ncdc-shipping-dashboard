import { sampleOrders } from './sample-data.js';

document.addEventListener('DOMContentLoaded', () => {
    const loginScreen = document.getElementById('login-screen');
    const dashboard = document.getElementById('dashboard');
    const ordersContainer = document.getElementById('orders-container');
    const summaryContent = document.getElementById('summary-content');

    document.getElementById('login-btn').addEventListener('click', () => {
        loginScreen.classList.add('hidden');
        dashboard.classList.remove('hidden');
        renderDashboard();
    });

    function renderDashboard() {
        ordersContainer.innerHTML = '';
        sampleOrders.forEach(order => {
            const div = document.createElement('div');
            div.className = 'order-card';
            div.innerHTML = `
                <p><strong>BOL#:</strong> ${order.bol}</p>
                <p><strong>Customer:</strong> ${order.customer}</p>
                <p><strong>Status:</strong> ${order.status}</p>
                <p><strong>Carrier:</strong> ${order.carrier}</p>
                <p><strong>Pickup:</strong> ${order.pickupDay}</p>
            `;
            ordersContainer.appendChild(div);
        });

        summaryContent.innerHTML = `
            <p>Total Orders: ${sampleOrders.length}</p>
            <p>Ready to Stage: ${sampleOrders.filter(o => o.status === 'To Stage').length}</p>
            <p>Ready to Load: ${sampleOrders.filter(o => o.status === 'To Load').length}</p>
        `;
    }
});
