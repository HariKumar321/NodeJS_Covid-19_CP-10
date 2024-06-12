const express = require('express') //3rd party pkg from NPM Website
const {open} = require('sqlite') //3rd party pkg from NPM Website
const sqlite3 = require('sqlite3') //3rd party pkg from NPM Website
const bcrypt = require('bcrypt') //3rd party pkg from NPM Website
const jwt = require('jsonwebtoken') //3rd party pkg from NPM Website

const path = require('path') // core module of NODE JS

const app = express() //server instance created
app.use(express.json()) // recognise JSON Object

const dpPath = path.join(__dirname, 'covid19IndiaPortal.db')
let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dpPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Running URL')
    })
  } catch (error) {
    console.log(`DB Error: ${error.message}`)
    process.exit(1)
  }
}

initializeDBAndServer()

const dbObjToResponseObjState = dbObj => {
  return {
    stateId: dbObj.state_id,
    stateName: dbObj.state_name,
    population: dbObj.population,
  }
}

function dbObjToResponseObjDistrict(dbObj) {
  return {
    districtId: dbObj.district_id,
    districtName: dbObj.district_name,
    stateId: dbObj.state_id,
    cases: dbObj.cases,
    cured: dbObj.cured,
    active: dbObj.active,
    deaths: dbObj.deaths,
  }
}

const authenticateToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'HariKumar', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        next()
      }
    })
  }
}

//URL : http://localhost:3000
//API-1 user login ---> Path: /login/ ---> URL: http://localhost:3000/login/
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `
    SELECT *
    FROM user
    WHERE username = "${username}";`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    response.status(401)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(
      request.body.password,
      dbUser.password,
    )
    if (isPasswordMatched === true) {
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'HariKumar')
      response.send({jwtToken})
    } else {
      response.status(401)
      response.send('Invalid password')
    }
  }
})

//API-2 Returns a list of all states in the state table -> Path: /states/ -> URL: http://localhost:3000/states/
app.get('/states/', authenticateToken, async (request, response) => {
  const allStatesQuery = `
            SELECT *
            FROM state
            ORDER BY state_id;`
  const allStates = await db.all(allStatesQuery)
  response.send(allStates.map(eachObj => dbObjToResponseObjState(eachObj)))
})

//API-3 Returns a state based on the state ID -> Path: /states/:stateId/ -> URL: http://localhost:3000/states/:stateId/
app.get('/states/:stateId/', authenticateToken, async (request, response) => {
  const {stateId} = request.params
  const allStatesQuery = `
            SELECT *
            FROM state
            WHERE state_id = ${stateId};`
  const allStates = await db.get(allStatesQuery)
  console.log(allStates)
  response.send({
    stateId: allStates['state_id'],
    stateName: allStates['state_name'],
    population: allStates['population'],
  })
})

//API-4 Create a district in the district table, district_id is auto-incremented -> Path: /districts/
//URL: http://localhost:3000/districts/
app.post('/districts/', authenticateToken, async (request, response) => {
  const {districtName, stateId, cases, cured, active, deaths} = request.body
  const addDistrictQuery = `
    INSERT INTO district (district_name, state_id, cases, cured, active, deaths) 
    VALUES ("${districtName}", ${stateId}, ${cases}, ${cured}, ${active}, ${deaths});`
  const addDistrict = await db.run(addDistrictQuery)
  response.send('District Successfully Added')
})

//API-5 Returns a district based on the district ID -> Path: /districts/:districtId/
//URL: http://localhost:3000/districts/districtId/
app.get(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const getDistrictByIdQuery = `
    SELECT *
    FROM district
    WHERE district_id = ${districtId};`
    const getDistrict = await db.get(getDistrictByIdQuery)
    const {district_id, district_name, state_id, cases, cured, active, deaths} =
      getDistrict
    const camelCaseObj = {
      districtId: district_id,
      districtName: district_name,
      stateId: state_id,
      cases: cases,
      cured: cured,
      active: active,
      deaths: deaths,
    }
    response.send(camelCaseObj)
  },
)

//API-6 Deletes a district from the district table based on the district ID -> Path: /districts/:districtId/
//URL: http://localhost:3000/districts/districtId/
app.delete(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const deleteSpecificDistrictQuery = `
    DELETE FROM district
    WHERE district_id = ${districtId};`
    await db.run(deleteSpecificDistrictQuery)
    response.send('District Removed')
  },
)

//API-7 Updates the details of a specific district based on the district ID -> Path: /districts/:districtId/
//URL: http://localhost:3000/districts/districtId/
app.put(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const {districtName, stateId, cases, cured, active, deaths} = request.body
    const updateDistrictQuery = `
      UPDATE district
      SET 
        district_name = "${districtName}",
        state_id = ${stateId},
        cases = ${cases},
        cured = ${cured},
        active = ${active},
        deaths = ${deaths}
      WHERE district_id = ${districtId};`
    await db.run(updateDistrictQuery)
    response.send('District Details Updated')
  },
)

//API-8 Returns the statistics of total cases, cured, active, deaths of a specific state based on state ID
//Path: /states/:stateId/stats/
//URL: http://localhost:3000/states/stateId/stats/
app.get(
  '/states/:stateId/stats/',
  authenticateToken,
  async (request, response) => {
    const {stateId} = request.params
    const statisticsData = `
    SELECT SUM(cases), SUM(cured), SUM(active), SUM(deaths)
    FROM district
    WHERE state_id = ${stateId};
  `
    const dbData = await db.get(statisticsData)
    console.log(dbData)
    response.send({
      totalCases: dbData['SUM(cases)'],
      totalCured: dbData['SUM(cured)'],
      totalActive: dbData['SUM(active)'],
      totalDeaths: dbData['SUM(deaths)'],
    })
  },
)

module.exports = app
