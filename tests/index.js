Feature('Yandex test')

const assert = require('assert')

const page = {
  myForm: '#myForm',
  fioInput: 'input[name="fio"]',
  fioInputError: 'b-input-text[name="fio"][error]',
  emailInput: 'input[name="email"]',
  emailInputError: 'b-input-text[name="email"][error]',
  phoneInput: 'input[name="phone"]',
  phoneInputError: 'b-input-text[name="phone"][error]',
  submitButton: '#submitButton button',
  disabledSubmitButton: '#submitButton[disabled]',
  resultContainer: '#resultContainer',
  successMessage: '#resultContainer.success',
  errorMessage: '#resultContainer.error',
  progressMessage: '#resultContainer.progress'
}

const data = {
  fio: 'Ivan Ivanovich Ivanov',
  email: 'test@yandex.ru',
  phone: '+7(111)555-11-11'
}

Scenario('form layout', I => {
  I.amOnPage('/')
  I.seeElement(page.myForm)
  I.seeElement(page.fioInput)
  I.seeElement(page.emailInput)
  I.seeElement(page.phoneInput)
  I.seeElement(page.submitButton)
  I.seeElement(page.resultContainer)
})

Scenario('empty form validation', I => {
  I.amOnPage('/')
  I.click(page.submitButton)
  I.seeElement(page.fioInputError)
  I.seeElement(page.emailInputError)
  I.seeElement(page.phoneInputError)
})

Scenario('fio validation', I => {
  I.amOnPage('/')
  I.fillField(page.fioInput, 'Ivan')
  I.click(page.submitButton)
  I.seeElement(page.fioInputError)
  I.fillField(page.fioInput, 'Ivan Ivanovich')
  I.click(page.submitButton)
  I.seeElement(page.fioInputError)
  I.fillField(page.fioInput, data.fio)
  I.click(page.submitButton)
  I.dontSeeElement(page.fioInputError)
})

Scenario('email validation', I => {
  I.amOnPage('/')
  I.fillField(page.emailInput, 'test')
  I.click(page.submitButton)
  I.seeElement(page.emailInputError)
  I.fillField(page.emailInput, 'test@gmail.com')
  I.click(page.submitButton)
  I.seeElement(page.emailInputError)
  I.fillField(page.emailInput, data.email)
  I.click(page.submitButton)
  I.dontSeeElement(page.emailInputError)
})

Scenario('phone validation', I => {
  I.amOnPage('/')
  I.fillField(page.phoneInput, 'test')
  I.click(page.submitButton)
  I.seeElement(page.phoneInputError)
  I.fillField(page.phoneInput, '12345678901')
  I.click(page.submitButton)
  I.seeElement(page.phoneInputError)
  I.fillField(page.phoneInput, '+7(111)555-11-13')
  I.click(page.submitButton)
  I.seeElement(page.phoneInputError)
  I.fillField(page.phoneInput, data.phone)
  I.click(page.submitButton)
  I.dontSeeElement(page.phoneInputError)
})

Scenario('success message', I => {
  I.amOnPage('/')
  I.fillField(page.fioInput, data.fio)
  I.fillField(page.emailInput, data.email)
  I.fillField(page.phoneInput, data.phone)
  I.click(page.submitButton)
  I.see('Success', page.successMessage)
})

Scenario('error message', I => {
  I.amOnPage('/error.html')
  I.fillField(page.fioInput, data.fio)
  I.fillField(page.emailInput, data.email)
  I.fillField(page.phoneInput, data.phone)
  I.click(page.submitButton)
  I.see('Error message here', page.errorMessage)
})

Scenario('progress message', I => {
  I.amOnPage('/progress.html')
  I.fillField(page.fioInput, data.fio)
  I.fillField(page.emailInput, data.email)
  I.fillField(page.phoneInput, data.phone)
  I.click(page.submitButton)
  I.see('Repeat in 3000 ms', page.progressMessage)
})

Scenario('MyForm.validate', async (I) => {
  I.amOnPage('/')
  I.fillField(page.fioInput, 'test')
  I.fillField(page.emailInput, 'test')
  I.fillField(page.phoneInput, 'test')
  const validation = await I.executeAsyncScript(done => {
    const validation = window.MyForm.validate()
    done(JSON.stringify(validation))
  })
  assert.equal(validation, JSON.stringify({isValid: false, errorFields: ['fio', 'email', 'phone']}))
})

Scenario('MyForm.getData', async (I) => {
  I.amOnPage('/')
  I.fillField(page.fioInput, 'test')
  I.fillField(page.emailInput, 'test')
  I.fillField(page.phoneInput, 'test')
  const validation = await I.executeAsyncScript(done => {
    const fromData = window.MyForm.getData()
    done(JSON.stringify(fromData))
  })
  assert.equal(validation, JSON.stringify({fio: 'test', email: 'test', phone: 'test'}))
})

Scenario('MyForm.setData', I => {
  I.amOnPage('/')
  I.executeScript(() => {
    window.MyForm.setData({fio: 'test', email: 'test', phone: 'test'})
  })
  I.seeInField(page.fioInput, 'test')
  I.seeInField(page.emailInput, 'test')
  I.seeInField(page.phoneInput, 'test')
})

Scenario('MyForm.submit', I => {
  I.amOnPage('/')
  I.fillField(page.fioInput, 'test')
  I.fillField(page.emailInput, 'test')
  I.fillField(page.phoneInput, 'test')
  I.executeScript(() => {
    window.MyForm.submit()
  })
  I.seeElement(page.fioInputError)
  I.seeElement(page.emailInputError)
  I.seeElement(page.phoneInputError)

  I.fillField(page.fioInput, data.fio)
  I.fillField(page.emailInput, data.email)
  I.fillField(page.phoneInput, data.phone)
  I.executeScript(() => {
    window.MyForm.submit()
  })
  I.waitForElement(page.successMessage)
  I.see('Success', page.successMessage)
})