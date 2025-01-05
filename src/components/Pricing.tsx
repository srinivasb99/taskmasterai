\<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment</title>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <script src="theme.js"></script>
    <style>
        :root {
            --primary-color: #6C63FF;
            --secondary-color: #3F3D56;
            --accent-color: #F50057;
            --text-color: #F8F9FA;
            --bg-color: #121212;
            --card-bg: #1E1E1E;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Poppins', sans-serif;
            line-height: 1.6;
            color: var(--text-color);
            background-color: var(--bg-color);
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 2rem;
        }

        header {
            padding: 1.5rem 0;
            background-color: rgba(31, 41, 55, 0.8);
            backdrop-filter: blur(10px);
            position: sticky;
            top: 0;
            z-index: 1000;
        }

        nav {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .logo {
            font-size: 1.4rem;
            font-weight: 700;
            color: var(--primary-color);
            display: flex;
            align-items: center;
            transition: color 0.3s ease, transform 0.3s ease;
        }

        .logo svg {
            width: 50px; /* Increased size */
            height: 50px; /* Increased size */
            margin-right: 10px;
            transition: transform 0.3s ease;
        }

        .logo:hover {
            color: var(--primary-color);
            transform: scale(1.05);
        }

        .logo a {
            display: flex;
            align-items: center;
            text-decoration: none;
            color: inherit;
        }

        .nav-links {
            display: flex;
            align-items: center;
        }

        .nav-links a {
            color: var(--text-color);
            text-decoration: none;
            margin-left: 1.5rem;
            font-weight: 500;
            font-size: 0.9rem;
            transition: color 0.3s ease;
        }

        .nav-links a:hover {
            color: var(--primary-color);
        }

        .get-started-btn {
            background-color: var(--accent-color);
            color: var(--text-color);
            padding: 0.5rem 1rem;
            border-radius: 50px;
            text-decoration: none;
            font-weight: 600;
            font-size: 0.9rem;
            transition: all 0.3s ease;
            margin-left: 1.5rem;
        }

        .get-started-btn:hover {
            background-color: #0EA5E9;
            transform: translateY(-2px);
        }

        .hero {
            padding: 8rem 0;
            text-align: center;
            background: linear-gradient(135deg, var(--bg-color), var(--secondary-color));
        }

        h1 {
            font-size: 4.5rem;
            font-weight: 700;
            margin-bottom: 1.5rem;
            background: linear-gradient(to right, var(--primary-color), var(--accent-color));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            line-height: 1.2;
        }

        .hero p {
            font-size: 1.4rem;
            max-width: 700px;
            margin: 0 auto 3rem;
            color: #D1D5DB;
        }

        .cta-button {
            display: inline-block;
            background-color: var(--accent-color);
            color: var(--text-color);
            padding: 1rem 2.5rem;
            border-radius: 50px;
            text-decoration: none;
            font-weight: 600;
            font-size: 1.2rem;
            transition: all 0.3s ease;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            position: relative;
        }

        .cta-button:hover {
            background-color: #0EA5E9;
            transform: translateY(-2px);
            box-shadow: 0 6px 8px rgba(0, 0, 0, 0.2);
        }

        .cta-button::after {
            content: 'No credit card required';
            position: absolute;
            bottom: -25px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 0.8rem;
            color: #D1D5DB;
            white-space: nowrap;
        }

        .features {
            padding: 8rem 0;
        }

        .features-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 3rem;
        }

        .feature {
            background-color: var(--card-bg);
            border-radius: 15px;
            padding: 2.5rem;
            transition: all 0.3s ease;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .feature:hover {
            transform: translateY(-10px);
            box-shadow: 0 10px 20px rgba(79, 70, 229, 0.2);
        }

        .feature h3 {
            font-size: 1.8rem;
            margin-bottom: 1rem;
            color: var(--primary-color);
        }

        .feature p {
            font-size: 1.1rem;
            color: #D1D5DB;
        }

        .trusted-section {
            text-align: center;
            padding: 6rem 0;
            background-color: var(--secondary-color);
        }

        .trusted-section h2 {
            font-size: 2.5rem;
            margin-bottom: 3rem;
            color: var(--text-color);
        }

        .logo-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 3rem;
            align-items: center;
        }

        .logo-item {
            background-color: rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            padding: 1.5rem;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100px;
            transition: all 0.3s ease;
        }

        .logo-item:hover {
            background-color: rgba(255, 255, 255, 0.2);
            transform: scale(1.05);
        }

        .logo-item img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
        }

        footer {
            text-align: center;
            padding: 3rem 0;
            background-color: var(--card-bg);
            color: #D1D5DB;
        }

        .payment-container {
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 5rem 0;
        }

        .payment-card {
            background-color: var(--card-bg);
            border-radius: 15px;
            padding: 2.5rem;
            transition: all 0.3s ease;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            max-width: 400px;
            width: 100%;
        }

        .payment-card h2 {
            font-size: 2rem;
            margin-bottom: 1rem;
            color: var(--primary-color);
            text-align: center;
        }

        .payment-card form {
            display: flex;
            flex-direction: column;
        }

        .payment-card label {
            font-size: 0.9rem;
            margin-bottom: 0.5rem;
            color: #D1D5DB;
        }

        .payment-card input {
            padding: 0.75rem;
            border-radius: 10px;
            border: none;
            margin-bottom: 1rem;
            font-size: 1rem;
            color: #333;
        }

        .payment-card input[type="text"],
        .payment-card input[type="email"] {
            width: 100%;
        }

        .payment-card input[type="text"]::placeholder,
        .payment-card input[type="email"]::placeholder {
            color: #A0AEC0;
        }

        .payment-card .card-details {
            display: flex;
            justify-content: space-between;
        }

        .payment-card .card-details input {
            width: 48%;
        }

        .payment-card button {
            background-color: var(--accent-color);
            color: var(--text-color);
            padding: 0.75rem;
            border-radius: 50px;
            border: none;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            text-align: center;
        }

        .payment-card button:hover {
            background-color: #0EA5E9;
            transform: translateY(-2px);
        }

        footer {
            text-align: center;
            padding: 3rem 0;
            background-color: var(--card-bg);
            color: #D1D5DB;
        }

        /* Mobile Styles */
        @media (max-width: 768px) {
            .nav-links {
                display: none;
                flex-direction: column;
                align-items: flex-start;
                background-color: var(--secondary-color);
                position: absolute;
                top: 100%;
                left: 0;
                width: 100%;
                padding: 1rem;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
            }

            .nav-links a {
                font-size: 0.8rem;
                margin-left: 0;
                margin-bottom: 0.5rem;
            }

            .get-started-btn {
                font-size: 0.8rem;
                padding: 0.4rem 0.8rem;
            }

            .nav-links.active {
                display: flex;
            }

            .sidebar-toggle {
                display: block;
                background-color: transparent;
                border: none;
                cursor: pointer;
                color: #7E6BF1;
                font-family: 'Poppins', sans-serif;
            }

            .sidebar-toggle svg {
                width: 40px;
                height: 40px;
            }

            h1 {
                font-size: 2rem;
            }

            .pricing-container {
                flex-direction: column;
                gap: 1.5rem;
            }

            .pricing-plan {
                width: auto;
            }

            .logo span {
                display: none;
            }

            .logo svg {
                width: 40px;
                height: 40px;
                margin-right: 10px;
                transition: transform 0.3s ease;
            }

            .pricing-toggle button {
                font-size: 0.8rem;
            }

            .pricing-plan h2 {
                font-size: 1.5rem;
            }

            .price {
                font-size: 1.5rem;
            }

            .price span {
                font-size: 0.85rem;
            }

            .billing-cycle {
                font-size: 0.8rem;
            }

            li {
                font-size: 0.8rem;
            }

            .cta-button {
                font-size: 0.8rem;
                padding: 0.6rem;
            }

            


            /* Updated styles for mobile Get Started button */
            .mobile-get-started {
                display: block;
                background-color: var(--accent-color);
                color: var(--text-color);
                padding: 0.5rem 1rem;
                border-radius: 50px;
                text-decoration: none;
                font-weight: 600;
                font-size: 0.9rem;
                margin-right: 1rem;
            }

            nav {
                justify-content: space-between;
            }

            .logo {
                margin-right: auto;
            }

            .mobile-menu-container {
                display: flex;
                align-items: center;
            }
        }

        /* Hide sidebar toggle on desktop */
        @media (min-width: 769px) {
            .sidebar-toggle {
                display: none;
            }

            .nav-links {
                background-color: var(--secondary-color);
                width: 100%;
                position: absolute;
                top: 60px;
                left: 0;
                display: none;
                flex-direction: column;
                padding: 1rem;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
            }

            .nav-links a {
                font-size: 0.9rem;
                margin: 0.5rem 0;
            }

            .nav-links.active {
                display: flex;
            }

            .sidebar-toggle {
                display: block;
                background-color: transparent;
                border: none;
                cursor: pointer;
                color: var(--primary-color);
                font-size: 1.4rem;
                padding: 0.5rem 1rem;
            }

            /* Hide mobile Get Started button on desktop */
            .mobile-get-started {
                display: none;
            }

            .mobile-menu-container {
                display: none;
            }
        }

        /* Desktop Styles - Update these */
        @media (min-width: 769px) {
    .nav-links {
        display: flex;
        flex-direction: row;
        align-items: center;
        background-color: transparent;
        position: static;
        width: auto;
        padding: 0;
        box-shadow: none;
    }

    .nav-links a {
        font-size: 0.9rem;
        margin: 0 0 0 1.5rem;
    }

    .sidebar-toggle {
        display: none;
    }

    .mobile-get-started {
        display: none;
    }

    .mobile-menu-container {
        display: none;
    }

    .get-started-btn {
        display: inline-block;
    }
}
    </style>
</head>
<body>
    <header>
        <div class="container">
            <nav>
                <div class="logo">
                    <a href="index.html">
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        <span>TaskMasterAI</span>
                    </a>
                </div>

                <style>
                        .logo a {
                            display: flex;
                            align-items: center;
                            text-decoration: none;
                            color: --primary-color;
                            transition: color 0.3s ease;
                        }
                    
                        .logo svg {
                            width: 40px;
                            height: 40px;
                            margin-right: 10px;
                            transition: transform 0.3s ease;
                        }
                    
                        .logo span {
                            font-size: 24px;
                            font-weight: bold;
                        }
                    
                        .logo a:hover {
                            color: --primary-color;
                        }
                    
                        .logo a:hover svg {
                            transform: rotate(15deg) scale(1.1);
                        }
                    
                        .logo a:hover svg path {
                            stroke: --primary-color;
                            transition: stroke 0.3s ease;
                        }
                    </style>
                    <div class="mobile-menu-container">
                        <a href="signup.html" class="mobile-get-started" id="mobileGetStarted">Get Started</a>
                        <button class="sidebar-toggle">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M3 12H21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                <path d="M3 6H21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                <path d="M3 18H21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </button>
                    </div>
                    <div class="nav-links">
                    <a href="index.html#features">Features</a>
                    <a href="pricing.html">Pricing</a>
                    <a href="#about">About</a>
                    <a href="contact.html">Contact</a>
                    <a href="signup.html" class="get-started-btn" id="get-started-btn">Get started today</a>
                </div>
            </nav>
        </div>
    </header>

    <div class="payment-container">
        <div class="payment-card">
            <h2>Payment Details</h2>
            <form>
                <label for="cardholder-name">Cardholder Name</label>
                <input type="text" id="cardholder-name" placeholder="Cardholder Name" required>
                <label for="card-number">Card Number</label>
                <input type="text" id="card-number" placeholder="Card Number" required>
                <div class="card-details">
                    <div>
                        <label for="expiry-date">Expiration Date</label>
                        <input type="text" id="expiry-date" placeholder="MM/YY" required>
                    </div>
                    <div>
                        <label for="cvv">CVV</label>
                        <input type="text" id="cvv" placeholder="CVV" required>
                    </div>
                </div>
                <button type="submit">Submit Payment</button>
            </form>
        </div>
    </div>



    <footer>
        <div class="container">
            <p>&copy; 2024 TaskMaster AI. All rights reserved.</p>
        </div>
    </footer>

    <script>
        document.querySelector('.sidebar-toggle').addEventListener('click', function() {
            document.querySelector('.nav-links').classList.toggle('active');
        });
    </script>
    <script>
        const stripe = Stripe('your-publishable-key');

        document.getElementById('checkout-button').addEventListener('click', async () => {
            const response = await fetch('https://us-central1-your-project-id.cloudfunctions.net/createStripeCheckoutSession', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    priceId: 'your-price-id'
                })
            });

            const session = await response.json();

            const result = await stripe.redirectToCheckout({
                sessionId: session.id
            });

            if (result.error) {
                alert(result.error.message);
            }
        });
    </script>
</body>
</html>
