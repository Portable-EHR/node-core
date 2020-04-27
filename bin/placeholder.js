
class Placeholder {
    constructor(props) {
    }

    doIt(){}

    doItAgain(){
        return this.doIt() && this.doIt();
    }

}

class Place extends Placeholder {

    constructor(props) {
        super(props);
        console.log('a change initiated in telehealth project')

    }

}

module.exports.Place = Place;