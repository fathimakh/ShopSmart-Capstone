import './Footer.css'

function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <p className="footer-brand">
          Shop<strong>Smart</strong>
        </p>
        <p className="footer-note">
          A MERN capstone project exploring smarter product discovery. The catalogue is
          served by the ShopSmart API and was first seeded from the public DummyJSON
          product data.
        </p>
        <p className="footer-credit">Built by Fathima K H</p>
      </div>
    </footer>
  )
}

export default Footer
