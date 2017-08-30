import Form from '@basket/block/b-form'
import attributes from '@basket/block/utils/stringifyAttributes'
import '@basket/block/b-input-text'
import '@basket/block/b-button'

const validEmailDomains = [
  'ya.ru',
  'yandex.ru',
  'yandex.ua',
  'yandex.by',
  'yandex.kz',
  'yandex.com'
]

const validators = {}

validators.fio = function (value) {
  const parts = value.split(' ')

  if (parts.length !== 3) {
    return false
  }

  return true
}

validators.email = function (value) {
  const parts = value.split('@')

  if (parts.length !== 2) {
    return false
  }

  if (validEmailDomains.indexOf(parts[1]) === -1) {
    return false
  }

  return true
}

validators.phone = function (value) {
  const mask = /^[+]([7])[(]([0-9])([0-9])([0-9])[)]([0-9])([0-9])([0-9])-([0-9])([0-9])-([0-9])([0-9])$/

  const matches = mask.exec(value)

  if (!matches) {
    return false
  }

  const sum = matches.slice(1).reduce((sum, value) => sum + Number(value), 0)

  return sum <= 30
}

class MyForm extends Form {
  constructor () {
    super(...arguments)

    window.MyForm = {}
    window.MyForm.validate = this.validate.bind(this)
    window.MyForm.submit = this.submit.bind(this)
    window.MyForm.getData = () => this.serialize()
    window.MyForm.setData = (data) => { this.data = data }
  }

  static get tagName () {
    return 'my-form'
  }

  static get reflectedProperties () {
    return Object.assign({
      errorFields: [],
      data: {},
      result: {},
      progress: false
    }, super.reflectedProperties)
  }

  get template () {
    const {data, errorFields, result, progress} = this

    return (`
      <form id='myForm'>
        <div>
            <b-input-text ${attributes({
              name: 'fio',
              value: data.fio,
              label: 'ФИО',
              error: errorFields.includes('fio')
            })}></b-input-text>
        </div>
        <div>
            <b-input-text ${attributes({
              name: 'email',
              value: data.email,
              label: 'Email',
              error: errorFields.includes('email')
            })}></b-input-text>
        </div>
        <div>
            <b-input-text ${attributes({
              name: 'phone',
              value: data.phone,
              label: 'Phone',
              error: errorFields.includes('phone')
            })}></b-input-text>
        </div>
        <div>
            <b-button ${attributes({disabled: progress})} id='submitButton'>Save</b-button>
            <div id='resultContainer' class='${result.status}'>
              ${result.status === 'success' ? 'Success' : ''}
              ${result.status === 'error' ? result.reason : ''}
              ${result.status === 'progress' ? `Repeat in ${result.timeout} ms` : ''}
            </div>
        </div>
      </form>
    `)
  }

  validate (data) {
    const formData = data || this.serialize()

    const result = {
      isValid: true,
      errorFields: []
    }

    for (let key in formData) {
      const value = formData[key]
      const isValid = validators[key](value)

      !isValid && result.errorFields.push(key)
    }

    if (result.errorFields.length) {
      result.isValid = false
    }

    return result
  }

  submit () {
    this.errorFields = []
    this.result = {}
    this.data = this.serialize()
    const validation = this.validate(this.data)

    if (validation.isValid) {
      this.save(this.data)
    } else {
      this.errorFields = validation.errorFields
    }
  }

  save (data) {
    this.progress = true
    const formData = data || this.serialize()

    window.fetch(this.action, {
      method: 'POST',
      body: JSON.stringify(formData)
    })
      .then(res => res.json())
      .then(json => {
        this.result = json

        if (json.status === 'progress') {
          setTimeout(this.submit.bind(this), json.timeout)
        }

        this.progress = false
      })
      .catch(err => {
        this.result = {
          status: 'error',
          reason: err
        }

        this.progress = true
      })
  }
}

window.customElements.define(MyForm.tagName, MyForm)
