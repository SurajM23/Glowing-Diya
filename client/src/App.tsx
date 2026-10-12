import { Link, Route, Routes } from 'react-router-dom';
import AdminLayout from './admin/AdminLayout';
import Dashboard from './admin/Dashboard';
import Login from './admin/Login';
import { OrderDetail, Orders } from './admin/Orders';
import { Inventory, Products } from './admin/Catalog';
import { Audit, Campaigns, Deliveries, Reports } from './admin/Operations';
import Settings from './admin/Settings';
import Layout from './components/Layout';
import Home from './pages/Home';
import { ProductPage, Shop } from './pages/Shop';
import Checkout from './pages/Checkout';
import OrderDone from './pages/OrderDone';
import { Privacy, Terms } from './pages/Legal';
import { AccountLogin, AccountOrders } from './pages/Account';
import { Section } from './components/shared';

export default function App() {
  return (
    <Routes>
      <Route path="admin/login" element={<Login />} />
      <Route path="admin" element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="orders" element={<Orders />} />
        <Route path="orders/:id" element={<OrderDetail />} />
        <Route path="deliveries" element={<Deliveries />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="products" element={<Products />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
        <Route path="audit" element={<Audit />} />
      </Route>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="shop" element={<Shop />} />
        <Route path="shop/:slug" element={<ProductPage />} />
        <Route path="checkout" element={<Checkout />} />
        <Route path="order/:ref" element={<OrderDone />} />
        <Route path="account/login" element={<AccountLogin />} />
        <Route path="account/orders" element={<AccountOrders />} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="terms" element={<Terms />} />
        <Route path="*" element={<Section title="Page not found"><Link className="underline" to="/">Go home</Link></Section>} />
      </Route>
    </Routes>
  );
}
